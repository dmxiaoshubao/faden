import fs from "node:fs/promises"
import path from "node:path"

import {
  listClaudeSessionFiles,
  loadClaudeSessionIndex,
  parseClaudeSessionFile,
} from "./parsers/claude"
import {
  getCodexIndexPath,
  listCodexSessionFiles,
  loadCodexIndex,
  parseCodexSessionFile,
} from "./parsers/codex"
import { pathsMatch } from "./path-utils"
import { getAlias, loadSessionCache, saveSessionCache } from "./state"
import type {
  CachedSessionRecord,
  FadenState,
  FileStamp,
  SessionCacheEntry,
  SessionFilterOptions,
  SessionRecord,
} from "./types"

async function statStamp(filePath?: string): Promise<FileStamp | null> {
  if (!filePath) {
    return null
  }

  try {
    const stat = await fs.stat(filePath)
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    }
  } catch {
    return null
  }
}

function stampsEqual(left?: FileStamp | null, right?: FileStamp | null): boolean {
  if (!left && !right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return left.mtimeMs === right.mtimeMs && left.size === right.size
}

function withAlias(record: CachedSessionRecord, state: FadenState): SessionRecord {
  return {
    ...record,
    alias: getAlias(state, record.agent, record.sessionId),
  }
}

function toCacheEntry(
  record: CachedSessionRecord,
  sourceStat: FileStamp,
  indexStat: FileStamp | null,
): SessionCacheEntry {
  return {
    record,
    sourceStat,
    indexStat,
  }
}

export function sortSessions(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((left, right) => {
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

export function filterSessions(
  sessions: SessionRecord[],
  options: SessionFilterOptions,
  currentWorkingDir = process.cwd(),
): SessionRecord[] {
  const targetPath = options.includeAll ? undefined : options.path ?? currentWorkingDir
  const key = options.key?.trim().toLowerCase()

  return sessions.filter((session) => {
    if (options.agent && session.agent !== options.agent) {
      return false
    }

    if (targetPath && !pathsMatch(session.cwd, targetPath)) {
      return false
    }

    if (!key) {
      return true
    }

    const haystack = [
      session.alias,
      session.title,
      session.sessionId,
      session.cwd,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    return haystack.includes(key)
  })
}

export async function loadAllSessions(state: FadenState): Promise<SessionRecord[]> {
  const cache = await loadSessionCache()
  const nextEntries: Record<string, SessionCacheEntry> = {}
  const records: SessionRecord[] = []

  const codexIndexPath = getCodexIndexPath()
  const [codexFiles, codexIndexStat, claudeFiles] = await Promise.all([
    listCodexSessionFiles(),
    statStamp(codexIndexPath),
    listClaudeSessionFiles(),
  ])
  let codexIndexMap:
    | Awaited<ReturnType<typeof loadCodexIndex>>
    | undefined
  const claudeIndexMaps = new Map<string, Awaited<ReturnType<typeof loadClaudeSessionIndex>>>()

  for (const sourceFile of codexFiles) {
    const sourceStat = await statStamp(sourceFile)
    if (!sourceStat) {
      continue
    }

    const cached = cache.entries[sourceFile]
    if (cached && stampsEqual(cached.sourceStat, sourceStat) && stampsEqual(cached.indexStat, codexIndexStat)) {
      nextEntries[sourceFile] = cached
      records.push(withAlias(cached.record, state))
      continue
    }

    codexIndexMap ??= await loadCodexIndex()
    const parsed = await parseCodexSessionFile(sourceFile, codexIndexMap)
    if (!parsed) {
      continue
    }

    nextEntries[sourceFile] = toCacheEntry(parsed, sourceStat, codexIndexStat)
    records.push(withAlias(parsed, state))
  }

  for (const fileInfo of claudeFiles) {
    const sourceStat = await statStamp(fileInfo.sourceFile)
    if (!sourceStat) {
      continue
    }

    const indexStat = await statStamp(fileInfo.indexFile)
    const cached = cache.entries[fileInfo.sourceFile]
    if (cached && stampsEqual(cached.sourceStat, sourceStat) && stampsEqual(cached.indexStat, indexStat)) {
      nextEntries[fileInfo.sourceFile] = cached
      records.push(withAlias(cached.record, state))
      continue
    }

    let indexMap:
      | Awaited<ReturnType<typeof loadClaudeSessionIndex>>
      | undefined
    if (fileInfo.indexFile) {
      const projectDir = path.dirname(fileInfo.sourceFile)
      if (!claudeIndexMaps.has(projectDir)) {
        claudeIndexMaps.set(projectDir, await loadClaudeSessionIndex(projectDir))
      }
      indexMap = claudeIndexMaps.get(projectDir)
    }

    const parsed = await parseClaudeSessionFile(fileInfo.sourceFile, indexMap)
    if (!parsed) {
      continue
    }

    nextEntries[fileInfo.sourceFile] = toCacheEntry(parsed, sourceStat, indexStat)
    records.push(withAlias(parsed, state))
  }

  await saveSessionCache({
    version: 1,
    entries: nextEntries,
  })

  return sortSessions(records)
}
