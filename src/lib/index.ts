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
  resolveCredentialsFile,
} from './paths.js'

export { createBridgeClient, isLoggedIn } from './supabase.js'
export { sendRemote } from './send-remote.js'
export { listenRemote } from './listen-remote.js'
export { resolveBackend, type Backend } from './backend.js'
export { requestOtp, verifyOtp, logoutAndClear, whoami } from './auth.js'
export { messageToRow, rowToMessage, type MessageRow } from './message-row.js'
export { createFileStorage, clearCredentials, type FileStorage } from './credentials.js'
export { createQueue, type Queue } from './async-queue.js'
