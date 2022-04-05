/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { Project } from 'src/models/project/Project'
import { observer } from 'mobx-react-lite'
import { store } from '../../../mobx/store'
import { ProjectPage } from './projectPage/ProjectPage'
import { AiFillFolderOpen, AiOutlinePlusCircle } from 'react-icons/ai'
import { ProjectPageMenubar } from './projectPageMenubar/ProjectPageMenubar'
import { MappingsPage } from './MappingsPage'
import { HomePageId } from 'src/react/mobx/GuiStore'
import { BridgesPage } from './bridgesPage/BridgesPage'

export const HomePage: React.FC<{ project: Project }> = observer(function HomePage(props) {
	const activeHomePageId = store.guiStore.activeHomePageId

	return (
		<div className="project-page-layout">
			<ProjectPageMenubar
				activeItemId={activeHomePageId}
				onItemClick={(itemId) => {
					if (itemId === 'newProject') {
						alert('This feature is not implemented yet.')
					} else if (itemId === 'openProject') {
						alert('This feature is not implemented yet.')
					} else {
						store.guiStore.goToHome(itemId as HomePageId)
					}
				}}
				menubar={[
					{
						groupId: 'general',
						items: [
							{ id: 'newProject', label: 'New Project', icon: <AiOutlinePlusCircle /> },
							{ id: 'openProject', label: 'Open Project', icon: <AiFillFolderOpen /> },
						],
					},
					{
						groupId: 'project',
						items: [
							{ id: 'project', label: 'Project' },
							{
								id: 'bridgesSettings',
								label: 'Brigdes',
							},
							{
								id: 'mappingsSettings',
								label: 'Mappings',
							},
						],
					},
				]}
			/>
			{activeHomePageId === 'project' && <ProjectPage project={props.project} />}
			{activeHomePageId === 'bridgesSettings' && <BridgesPage project={props.project} />}
			{activeHomePageId === 'mappingsSettings' && <MappingsPage project={props.project} />}
		</div>
	)
})
