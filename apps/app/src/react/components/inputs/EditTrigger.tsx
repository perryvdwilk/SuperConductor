import { Button, ButtonGroup, Popover } from '@mui/material'

import React from 'react'

import { Trigger } from '../../../models/rundown/Trigger'
import { MdPlayArrow, MdStop } from 'react-icons/md'
import { BsTrash } from 'react-icons/bs'
import classNames from 'classnames'

const ACTION_ICON_SIZE = 12

export const EditTrigger: React.FC<{
	trigger: Trigger
	index: number
	onEdit: (index: number, trigger: Trigger | null) => void
}> = ({ trigger, index, onEdit }) => {
	const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null)

	const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
		setAnchorEl(event.currentTarget)
	}

	const handleClose = () => {
		setAnchorEl(null)
	}

	const editing = Boolean(anchorEl)
	const labelParts = trigger.label.split('+')

	return (
		<div className={classNames('trigger', { 'trigger-open': editing })}>
			<div className="label" onClick={handleClick}>
				<span className="label__action">
					{trigger.action === 'play' ? (
						<MdPlayArrow size={ACTION_ICON_SIZE} />
					) : trigger.action === 'stop' ? (
						<MdStop size={ACTION_ICON_SIZE} />
					) : trigger.action === 'playStop' ? (
						<>
							<MdPlayArrow size={ACTION_ICON_SIZE} />
							<MdStop size={ACTION_ICON_SIZE} />
						</>
					) : null}
				</span>
				{labelParts.map((part, index) => {
					const isKeyboard = trigger.fullIdentifiers[index].startsWith('keyboard')
					return (
						<React.Fragment key={index}>
							<div className={classNames('label__key', { 'label__key--keyboard': isKeyboard })}>
								<span className="label__key__text">{part}</span>
							</div>
							<span className="label__plus">+</span>
						</React.Fragment>
					)
				})}
			</div>

			<Popover
				open={editing}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{
					vertical: 'bottom',
					horizontal: 'left',
				}}
			>
				<div className="trigger__buttons">
					<Button
						variant="contained"
						onClick={() => {
							handleClose()
							onEdit(index, null)
						}}
						color="error"
						title="Delete Trigger"
						size="small"
					>
						<BsTrash size={ACTION_ICON_SIZE} />
					</Button>

					<ButtonGroup className="trigger__buttons__triggerType">
						<Button
							variant="contained"
							onClick={() => {
								onEdit(index, { ...trigger, action: 'play' })
							}}
							color={trigger.action === 'play' ? 'primary' : 'inherit'}
							title="Trigger Play"
							size="small"
						>
							<MdPlayArrow size={ACTION_ICON_SIZE} />
						</Button>
						<Button
							variant="contained"
							onClick={() => {
								onEdit(index, { ...trigger, action: 'stop' })
							}}
							color={trigger.action === 'stop' ? 'primary' : 'inherit'}
							title="Trigger Stop"
							size="small"
						>
							<MdStop size={ACTION_ICON_SIZE} />
						</Button>
						<Button
							variant="contained"
							onClick={() => {
								onEdit(index, { ...trigger, action: 'playStop' })
							}}
							color={trigger.action === 'playStop' ? 'primary' : 'inherit'}
							title="Trigger Toggle Play/Stop"
							size="small"
						>
							<MdPlayArrow size={ACTION_ICON_SIZE} />
							<MdStop size={ACTION_ICON_SIZE} />
						</Button>
					</ButtonGroup>

					{/* <Button variant="contained" color="primary" className={classNames('btn', 'btn--small')} onClick={}>

					 </Button> */}
					{/* <Button variant="contained" color="primary" className={classNames('btn', 'btn--small')} onClick={handleOnClick}>
			 	{props.active ? <BsKeyboardFill color="white" size={24} /> : <BsKeyboard color="white" size={24} />}
			</Button> */}
				</div>
			</Popover>
		</div>
	)
}