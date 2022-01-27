import short from 'short-uuid'
import { Project } from '../models/project/Project'
import { Rundown } from '../models/rundown/Rundown'
import { DeviceType, MappingCasparCG, TimelineContentTypeCasparCg } from 'timeline-state-resolver-types'
import { literal } from '@shared/lib'

export function getDefaultProject(newName = 'Default Project'): Omit<Project, 'id'> {
	return {
		name: newName,

		mappings: {
			'casparcg-1-10': literal<MappingCasparCG>({
				device: DeviceType.CASPARCG,
				deviceId: 'casparcg0',
				layerName: 'CasparCG 1-10',
				channel: 1,
				layer: 10,
			}),
			'casparcg-1-20': literal<MappingCasparCG>({
				device: DeviceType.CASPARCG,
				deviceId: 'casparcg0',
				layerName: 'CasparCG 1-20',
				channel: 1,
				layer: 20,
			}),
			'casparcg-1-30': literal<MappingCasparCG>({
				device: DeviceType.CASPARCG,
				deviceId: 'casparcg0',
				layerName: 'CasparCG 1-30',
				channel: 1,
				layer: 30,
			}),
			'casparcg-2-10': literal<MappingCasparCG>({
				device: DeviceType.CASPARCG,
				deviceId: 'casparcg0',
				layerName: 'CasparCG 2-10',
				channel: 2,
				layer: 10,
			}),
			'casparcg-2-20': literal<MappingCasparCG>({
				device: DeviceType.CASPARCG,
				deviceId: 'casparcg0',
				layerName: 'CasparCG 2-20',
				channel: 2,
				layer: 20,
			}),
			'casparcg-2-30': literal<MappingCasparCG>({
				device: DeviceType.CASPARCG,
				deviceId: 'casparcg0',
				layerName: 'CasparCG 2-30',
				channel: 2,
				layer: 30,
			}),
		},
		bridges: {
			bridget: {
				id: 'bridget',
				name: 'Bridget',
				outgoing: true,
				url: 'ws://localhost:5401',
				settings: {
					devices: {
						casparcg0: {
							type: DeviceType.CASPARCG,
							options: {
								host: '127.0.0.1',
								port: 5250,
							},
						},
					}, // todo: add some default devices
				},
			},
		},

		settings: {},
	}
}
export function getDefaultRundown(newName = 'Default Rundown'): Omit<Rundown, 'id'> {
	return {
		name: newName,

		groups: [
			{
				id: short.generate(),
				name: 'Main',

				transparent: false,

				autoPlay: false,
				loop: false,
				parts: [
					{
						id: short.generate(),
						name: 'Part 1',
						timeline: [
							{
								resourceId: 'someResource0',
								obj: {
									id: 'random0',
									enable: {
										start: 0,
										duration: 5000,
									},
									layer: 'casparcg-1-10',
									content: {
										type: TimelineContentTypeCasparCg.MEDIA,
										file: 'AMB',
										deviceType: DeviceType.CASPARCG,
									},
								},
							},
						],

						resolved: {
							duration: 10000,
						},
					},
				],
				playout: {
					startTime: null,
					partIds: [],
				},
				playheadData: null,
			},
		],
	}
}