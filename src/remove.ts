import fs from "node:fs/promises"
import path from "node:path"

import { atomicWriteFile, pathExists } from "./fs-utils"
import { removeAlias } from "./state"
import type { FadenState, SessionRecord } from "./types"

async function removeCodexSession(record: SessionRecord): Promise<void> {
  const sourceExists = await pathExists(record.sourceFile)
  if (!sourceExists) {
    throw new Error(`Codex 会话文件不存在: ${record.sourceFile}`)
  }

  const tempSessionFile = `${record.sourceFile}.faden-deleting`
  await fs.rename(record.sourceFile, tempSessionFile)
  let originalIndexRaw: string | undefined

  try {
    if (record.indexFile && (await pathExists(record.indexFile))) {
      originalIndexRaw = await fs.readFile(record.indexFile, "utf8")
      const filtered = originalIndexRaw
        .split(/\r?\n/)
        .filter((line) => {
          if (!line.trim()) {
            return false
          }
          try {
            const parsed = JSON.parse(line) as { id?: string }
            return parsed.id !== record.sessionId
          } catch {
            return true
          }
        })
        .join("\n")
      await atomicWriteFile(record.indexFile, filtered ? `${filtered}\n` : "")
    }

    await fs.unlink(tempSessionFile)
  } catch (error) {
    if (record.indexFile && originalIndexRaw !== undefined) {
      await atomicWriteFile(record.indexFile, originalIndexRaw).catch(() => undefined)
    }
    await fs.rename(tempSessionFile, record.sourceFile).catch(() => undefined)
    throw error
  }
}

async function removeClaudeSession(record: SessionRecord): Promise<void> {
  const sourceExists = await pathExists(record.sourceFile)
  if (!sourceExists) {
    throw new Error(`Claude 会话文件不存在: ${record.sourceFile}`)
  }

  const tempSessionFile = `${record.sourceFile}.faden-deleting`
  await fs.rename(record.sourceFile, tempSessionFile)
  let originalIndexRaw: string | undefined

  try {
    if (record.indexFile && (await pathExists(record.indexFile))) {
      originalIndexRaw = await fs.readFile(record.indexFile, "utf8")
      const parsed = JSON.parse(originalIndexRaw) as {
        version?: number
        entries?: Array<{ sessionId?: string }>
        [key: string]: unknown
      }
      const filteredEntries = (parsed.entries ?? []).filter((entry) => {
        return entry.sessionId !== record.sessionId
      })

      await atomicWriteFile(
        record.indexFile,
        `${JSON.stringify(
          {
            ...parsed,
            version: parsed.version ?? 1,
            entries: filteredEntries,
          },
          null,
          2,
        )}\n`,
      )
    }

    await fs.unlink(tempSessionFile)
  } catch (error) {
    if (record.indexFile && originalIndexRaw !== undefined) {
      await atomicWriteFile(record.indexFile, originalIndexRaw).catch(() => undefined)
    }
    await fs.rename(tempSessionFile, record.sourceFile).catch(() => undefined)
    throw error
  }
}

export async function removeSession(
  record: SessionRecord,
  state: FadenState,
): Promise<void> {
  if (record.agent === "codex") {
    await removeCodexSession(record)
  } else {
    await removeClaudeSession(record)
  }

  await removeAlias(state, record.agent, record.sessionId)
}
