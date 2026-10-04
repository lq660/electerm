import { isDestructiveCommand } from './agent-runtime.js'

export function getReplayableCommand (toolCall) {
  const command = toolCall?.args?.command
  return typeof command === 'string' ? command.trim() : ''
}

export function shouldConfirmCommandReplay (toolCall) {
  const command = getReplayableCommand(toolCall)
  return Boolean(command) && isDestructiveCommand(command)
}

export function canReplayCommand (toolCall) {
  return Boolean(getReplayableCommand(toolCall)) && !['running', 'pending_confirm'].includes(toolCall?.status)
}
