import { BrowserWindow, dialog, ipcMain } from 'electron'
import { AutoFillMode, Group } from '../models/rundown/Group'
import { IPCServer } from './IPCServer'
import { IPCClient } from './IPCClient'
import { updateTimeline } from './timeline'
import { GroupPreparedPlayData } from '../models/GUI/PreparedPlayhead'
import { StorageHandler } from './storageHandler'
import { AppData } from '../models/App/AppData'
import { Project } from '../models/project/Project'
import { Rundown } from '../models/rundown/Rundown'
import { SessionHandler } from './sessionHandler'
import { ResourceAny } from '@shared/models'
import { BridgeHandler, CURRENT_VERSION } from './bridgeHandler'
import _ from 'lodash'
import { BridgeStatus } from '../models/project/Bridge'
import { PeripheralStatus } from '../models/project/Peripheral'
import { TriggersHandler } from './triggersHandler'
import { ActiveTrigger, ActiveTriggers } from '../models/rundown/Trigger'
import { DefiningArea } from '../lib/triggers/keyDisplay'
import { LoggerLike } from '@shared/api'
import { hash, listAvailableDeviceIDs, rateLimitIgnore, updateGroupPlayingParts } from '../lib/util'
import { findAutoFillResources } from '../lib/autoFill'
import { Part } from '../models/rundown/Part'
import { getDefaultPart } from './defaults'
import { TimelineObj } from '../models/rundown/TimelineObj'
import { postProcessPart } from './rundown'
import { assertNever } from '@shared/lib'
import { TelemetryHandler } from './telemetry'
import { USER_AGREEMENT_VERSION } from '../lib/userAgreement'
import { HTTPAPI } from './HTTPAPI'

export class SuperConductor {
	mainWindow?: BrowserWindow
	ipcServer?: IPCServer
	ipcClient?: IPCClient
	httpAPI?: HTTPAPI

	session: SessionHandler
	storage: StorageHandler
	telemetryHandler: TelemetryHandler
	triggers?: TriggersHandler
	bridgeHandler?: BridgeHandler

	private shuttingDown = false
	private resourceUpdatesToSend: Array<{ id: string; resource: ResourceAny | null }> = []
	private __triggerBatchSendResourcesTimeout: NodeJS.Timeout | null = null
	private autoRefreshInterval: {
		interval: number
		timer: NodeJS.Timer
	} | null = null
	private refreshStatus: { [deviceId: string]: number } = {}

	private hasStoredStartupUserStatistics = false

	private internalHttpApiPort = 5500

	constructor(private log: LoggerLike, private renderLog: LoggerLike) {
		this.session = new SessionHandler()
		this.storage = new StorageHandler(
			log,
			{
				// Default window position:
				y: undefined,
				x: undefined,
				width: 1200,
				height: 600,
				maximized: false,
			},
			CURRENT_VERSION
		)
		this.telemetryHandler = new TelemetryHandler(this.log, this.storage)

		this.session.on('bridgeStatus', (id: string, status: BridgeStatus | null) => {
			this.ipcClient?.updateBridgeStatus(id, status)
		})
		this.session.on('peripheral', (peripheralId: string, peripheral: PeripheralStatus | null) => {
			this.ipcClient?.updatePeripheral(peripheralId, peripheral)
		})
		this.session.on('activeTriggers', (activeTriggers: ActiveTriggers) => {
			this.triggers?.updateActiveTriggers(activeTriggers)
			this.ipcClient?.updatePeripheralTriggers(activeTriggers)
		})
		this.session.on('definingArea', (definingArea: DefiningArea | null) => {
			this.triggers?.updateDefiningArea(definingArea)
			this.ipcClient?.updateDefiningArea(definingArea)
		})
		this.session.on('allTrigger', (fullIdentifier: string, trigger: ActiveTrigger | null) => {
			this.triggers?.registerTrigger(fullIdentifier, trigger)
		})
		this.storage.on('appData', (appData: AppData) => {
			this.ipcClient?.updateAppData(appData)
		})
		this.storage.on('project', (project: Project) => {
			this.ipcClient?.updateProject(project)
			this.handleAutoRefresh()
		})
		this.storage.on('rundown', (fileName: string, rundown: Rundown) => {
			this.ipcClient?.updateRundown(fileName, rundown)
		})
		this.storage.on('resource', (id: string, resource: ResourceAny | null) => {
			// Add the resource to the list of resources to send to the client in batches later:
			this.resourceUpdatesToSend.push({ id, resource })
			this._triggerBatchSendResources()
			this.triggerHandleAutoFill()
		})

		process.argv.forEach((value, index) => {
			if (value === '--disable-telemetry') {
				this.log.info('Telemetry disabled')
				this.telemetryHandler.disableTelemetry()
			} else if (value === '--internal-http-api-port') {
				this.internalHttpApiPort = parseInt(process.argv[index + 1], 10)
			}
		})

		const appData = this.storage.getAppData()
		if (appData.userAgreement === USER_AGREEMENT_VERSION) {
			// The user has previously agreed to the user agreement
			this.telemetryHandler.setUserHasAgreed()

			if (!this.hasStoredStartupUserStatistics) {
				this.hasStoredStartupUserStatistics = true
				this.telemetryHandler.onStartup()
			}
		}

		// Set up handlers for exceptions, to be reported
		process.on('uncaughtException', (err, origin) => {
			this.telemetryHandler.onError(`Uncaught exception: ${err}`, `Origin: ${origin}`)
			this.log.error(`Uncaught exception: ${err} \nOrigin: ${origin}`)
		})
		process.on('unhandledRejection', (reason: any, promise: any) => {
			this.telemetryHandler.onError(`Unhandled rejection: ${reason}`, `at ${promise}`)
			this.log.error(`Unhandled rejection: ${reason} \nat ${promise}`)
		})
		process.on('warning', (warning) => {
			this.telemetryHandler.onError(`Warning: ${warning.name}: ${warning.message}`, warning.stack)
			this.log.warn(`Warning: ${warning.name}: ${warning.message} \nStack: ${warning.stack}`)
		})
	}
	private _triggerBatchSendResources() {
		// Send updates of resources in batches to the client.
		// This is done to improve performance,
		// it turns out that sending a large amount of messages is slowly received by the client.
		if (!this.__triggerBatchSendResourcesTimeout) {
			this.__triggerBatchSendResourcesTimeout = setTimeout(() => {
				this.__triggerBatchSendResourcesTimeout = null
				this.ipcClient?.updateResources(this.resourceUpdatesToSend)
				this.resourceUpdatesToSend = []
			}, 100)
		}
	}
	private handleAutoRefresh() {
		const project = this.storage.getProject()
		const interval = project.autoRefreshInterval

		if (this.autoRefreshInterval && this.autoRefreshInterval.interval !== interval) {
			clearInterval(this.autoRefreshInterval.timer)
			this.autoRefreshInterval = null
		}

		if (interval && !this.autoRefreshInterval) {
			this.autoRefreshInterval = {
				interval,
				timer: setInterval(() => {
					if (this.autoRefreshInterval && this.shuttingDown) {
						clearInterval(this.autoRefreshInterval?.timer)
						this.autoRefreshInterval = null
					} else {
						let anyRefreshing = false
						for (const refreshTime of Object.values(this.refreshStatus)) {
							if (Date.now() - refreshTime < 10000) {
								anyRefreshing = true
								break
							}
						}
						if (!anyRefreshing) {
							this.refreshResources()
						} else {
							// Wait for refresh to finish, do nothing..
						}
					}
				}, project.autoRefreshInterval),
			}
		}
	}
	private triggerHandleAutoFill = rateLimitIgnore(() => this.handleAutoFill(), 100)
	private handleAutoFill() {
		const project = this.storage.getProject()
		let added = 0
		let removed = 0

		for (const rundown of this.storage.getAllRundowns()) {
			let rundownHasChanged = false
			for (const group of rundown.groups) {
				let groupHasChanged = false
				if (group.autoFill.enable) {
					const resources = findAutoFillResources(project, group.autoFill, this.storage.getResources())

					if (group.autoFill.mode === AutoFillMode.REPLACE) {
						const removedParts: Part[] = []
						let j = -1
						for (const r of resources) {
							const partId = `${group.id}_af_${hash(r.resource.id)}`

							// Try to find a matching part
							let foundPart: Part | undefined = undefined
							while (j < group.parts.length) {
								j++
								const part = group.parts[j]
								if (!part) break

								if (part.id === partId) {
									foundPart = part
									break
								} else if (part.autoFilled) {
									// huh, it's an autofilled part, but not ours.
									// Remove it:

									removedParts.push(...group.parts.splice(j, 1))
									removed++
									j--
									groupHasChanged = true
								} else {
									// Not our part, leave it be
								}
							}

							if (!foundPart) {
								let newPart: Part

								// See if the part was recently removed:
								const reInsertPart = removedParts.find((p) => p.id === partId)
								if (reInsertPart) {
									// Re-use the part:
									newPart = reInsertPart
								} else {
									// Add a new part to the group:
									newPart = {
										...getDefaultPart(),
										id: partId,
										name: r.resource.displayName,
										autoFilled: true,
									}

									const timelineObj: TimelineObj = {
										resourceId: r.resource.id,
										obj: r.obj,
										resolved: { instances: [] }, // set later
									}
									timelineObj.obj.layer = r.layerId
									newPart.timeline.push(timelineObj)
									postProcessPart(newPart)
								}

								group.parts.push(newPart)
								added++
								groupHasChanged = true
								j++
							}
						}

						// Remove residual auto-filled parts:
						while (j < group.parts.length) {
							j++
							const part = group.parts[j]
							if (!part) break

							if (part.autoFilled) {
								// it's an autofilled part, but not ours.
								// Remove it:
								removedParts.push(...group.parts.splice(j, 1))
								removed++
								j--
								groupHasChanged = true
							}
						}
					} else if (group.autoFill.mode === AutoFillMode.APPEND) {
						for (const r of resources) {
							const partId = `${group.id}_af_${hash(r.resource.id)}`

							const foundPart = group.parts.find((p) => p.id === partId)
							if (!foundPart) {
								// Add a new part to the group:
								const newPart: Part = {
									...getDefaultPart(),
									id: partId,
									name: r.resource.displayName,
									autoFilled: true,
								}

								const timelineObj: TimelineObj = {
									resourceId: r.resource.id,
									obj: r.obj,
									resolved: { instances: [] }, // set later
								}
								timelineObj.obj.layer = r.layerId

								newPart.timeline.push(timelineObj)
								postProcessPart(newPart)

								group.parts.push(newPart)
								added++
								groupHasChanged = true
							}
						}
					} else {
						assertNever(group.autoFill.mode)
					}
				}
				if (groupHasChanged) {
					rundownHasChanged = true
					// Update Timeline:
					group.preparedPlayData = this.updateTimeline(group)
					updateGroupPlayingParts(group)
				}
			}
			if (rundownHasChanged) {
				this.storage.updateRundown(rundown.id, rundown)
			}
		}
		if (added || removed) {
			this.triggers?.triggerUpdatePeripherals()
		}
	}

	initWindow(mainWindow: BrowserWindow) {
		this.mainWindow = mainWindow

		const bridgeHandler = new BridgeHandler(this.log, this.session, this.storage, {
			updatedResources: (deviceId: string, resources: ResourceAny[]): void => {
				if (this.shuttingDown) return
				// Added/Updated:
				const newResouceIds = new Set<string>()
				for (const resource of resources) {
					newResouceIds.add(resource.id)
					if (!_.isEqual(this.storage.getResource(resource.id), resource)) {
						this.storage.updateResource(resource.id, resource)
					}
				}
				// Removed:
				for (const id of this.storage.getResourceIds(deviceId)) {
					if (!newResouceIds.has(id)) this.storage.updateResource(id, null)
				}
			},
			onVersionMismatch: (bridgeId: string, bridgeVersion: string, ourVersion: string): void => {
				dialog
					.showMessageBox(mainWindow, {
						type: 'warning',
						title: 'Bridge version mismatch',
						message: `The connected bridge "${bridgeId}" is of a different version than SuperConductor.
						\nBridge version: v${bridgeVersion}
						SuperConductor version: v${ourVersion}
						\nThis is likely to result in errors and unexpected behavior. Please ensure that both SuperConductor and tsr-bridge are up-to-date.`,
					})
					.catch(this.log.error)
			},
			onDeviceRefreshStatus: (deviceId, refreshing) => {
				if (this.shuttingDown) return
				if (refreshing) {
					this.refreshStatus[deviceId] = Date.now()
				} else {
					delete this.refreshStatus[deviceId]
				}
				this.ipcClient?.updateDeviceRefreshStatus(deviceId, refreshing)
			},
		})
		this.bridgeHandler = bridgeHandler

		this.ipcServer = new IPCServer(ipcMain, this.log, this.renderLog, this.storage, this.session, {
			refreshResources: () => {
				this.refreshResources()
			},
			refreshResourcesSetAuto: (interval: number) => {
				const project = this.storage.getProject()
				project.autoRefreshInterval = interval
				this.storage.updateProject(project)
			},
			updateTimeline: (group: Group): GroupPreparedPlayData | null => {
				return this.updateTimeline(group)
			},
			updatePeripherals: (): void => {
				this.triggers?.triggerUpdatePeripherals()
			},
			setKeyboardKeys: (activeKeys: ActiveTrigger[]): void => {
				this.triggers?.setKeyboardKeys(activeKeys)
			},
			triggerHandleAutoFill: () => {
				this.triggerHandleAutoFill()
			},
			makeDevData: async () => {
				await this.storage.makeDevData()
			},
			onAgreeToUserAgreement: () => {
				this.telemetryHandler.setUserHasAgreed()
				this.telemetryHandler.onAcceptUserAgreement()

				if (!this.hasStoredStartupUserStatistics) {
					this.hasStoredStartupUserStatistics = true
					this.telemetryHandler.onStartup()
				}
			},
			handleError: (error: string, stack?: string) => {
				this.log.error(error, stack)
				this.telemetryHandler.onError(error, stack)
			},
		})
		this.ipcClient = new IPCClient(this.mainWindow)
		this.triggers = new TriggersHandler(this.log, this.storage, this.ipcServer, this.bridgeHandler)
		this.httpAPI = new HTTPAPI(this.internalHttpApiPort, this.ipcServer, this.log)
	}
	private refreshResources(): void {
		// Remove resources of devices we don't have anymore:
		const project = this.storage.getProject()
		const deviceIds = listAvailableDeviceIDs(project.bridges)
		for (const [id, resource] of Object.entries(this.storage.getResources())) {
			if (!deviceIds.has(resource.deviceId)) {
				this.storage.updateResource(id, null)
			}
		}

		this.bridgeHandler?.refreshResources()
	}

	private updateTimeline(group: Group): GroupPreparedPlayData | null {
		if (!this.bridgeHandler) throw new Error('Internal Error: No bridgeHandler set')

		return updateTimeline(this.storage, this.bridgeHandler, group)
	}

	/**
	 * Is called when the app is starting to shut down.
	 * After this has been called, the client window has closed.
	 */
	isShuttingDown() {
		this.shuttingDown = true
		this.session.terminate()
	}
	/**
	 * Is called when the app is shutting down.
	 * Shut down everything
	 */
	terminate() {
		this.storage.terminate()
		this.triggerHandleAutoFill.clear()
	}
}
