import { appendFile, stat } from 'node:fs/promises'
import lockfile from 'proper-lockfile'
import { ensureRoomFile, refuseSymlink } from './paths.js'
import { buildMessage, serializeMessage, type BuildMessageInput, type Message } from './schema.js'

const SOFT_CAP_BYTES = 10 * 1024 * 1024
const HARD_CAP_BYTES = 100 * 1024 * 1024

export async function sendMessage(input: BuildMessageInput): Promise<Message> {
  const message = buildMessage(input)
  const path = await ensureRoomFile(input.room)
  await refuseSymlink(path)

  const s = await stat(path)
  if (s.size >= HARD_CAP_BYTES) {
    throw new Error(
      `cc-bridge: room file exceeds 100MB hard cap. Run \`cc-bridge rooms clear ${input.room}\` to reset.`,
    )
  }
  if (s.size >= SOFT_CAP_BYTES) {
    process.stderr.write(
      `cc-bridge: warn — room file exceeds 10MB soft cap (${Math.floor(s.size / 1_048_576)}MB). Consider \`cc-bridge rooms clear ${input.room}\`.\n`,
    )
  }

  const release = await lockfile.lock(path, {
    retries: { retries: 50, minTimeout: 25, maxTimeout: 500, factor: 1.2 },
    stale: 10_000,
  })
  try {
    await appendFile(path, `${serializeMessage(message)}\n`, { mode: 0o600 })
  } finally {
    await release()
  }
  return message
}
