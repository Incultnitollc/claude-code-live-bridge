export {
  MessageSchema,
  SCHEMA_VERSION,
  buildMessage,
  parseMessage,
  serializeMessage,
  type Message,
  type BuildMessageInput,
  type ParseResult,
} from './schema.js'

export { sendMessage } from './send.js'

export {
  listen,
  replayLastN,
  type ListenEvent,
  type ListenOptions,
  type ListenController,
} from './listen.js'

export { listRooms, clearRoom, reapStaleSessions, type RoomInfo } from './rooms.js'

export { validateFile, type ValidationError, type ValidationResult } from './validate.js'

export { getSessionId, resetSessionIdCache } from './identity.js'

export {
  resolveBaseDir,
  resolveRoomFile,
  ensureBaseDir,
  ensureRoomFile,
  isValidRoomName,
} from './paths.js'
