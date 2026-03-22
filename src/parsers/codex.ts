import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { walkFiles, pathExists } from "../fs-utils"
import type {
  CachedSessionRecord,
  CodexSessionIndexEntry,
} from "../types"
import { cleanText, safeJsonParse, toIsoDate, truncate } from "./shared"

interface CodexSummaryDraft {
  sessionId: string | null
  cwd: string | null
  title: string | null
  updatedAt: string | null
  gitBranch: string | null
  messageCount: number
}

export function getCodexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex")
}

export function getCodexSessionsDir(): string {
  return path.join(getCodexHome(), "sessions")
}

export function getCodexIndexPath(): string {
  return path.join(getCodexHome(), "session_index.jsonl")
}

function extractCodexTitleCandidate(input: string): string | null {
  const cleaned = cleanText(input)
  if (!cleaned) {
    return null
  }

  if (cleaned.startsWith("<environment_context>")) {
    return null
  }

  return truncate(cleaned.replace(/\s+/g, " "), 100)
}

function extractResponseText(payload: Record<string, unknown>): string | null {
  const content = payload.content
  if (!Array.isArray(content)) {
    return null
  }

  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      return item.text
    }
  }

  return null
}

export function parseCodexSummaryFromLines(lines: string[]): CodexSummaryDraft | null {
  const draft: CodexSummaryDraft = {
    sessionId: null,
    cwd: null,
    title: null,
    updatedAt: null,
    gitBranch: null,
    messageCount: 0,
  }

  for (const line of lines) {
    const value = safeJsonParse<Record<string, unknown>>(line)
    if (!value) {
      continue
    }

    const timestamp = typeof value.timestamp === "string" ? toIsoDate(value.timestamp) : null
    if (timestamp) {
      draft.updatedAt = timestamp
    }

    const type = typeof value.type === "string" ? value.type : ""
    if (type === "session_meta" && value.payload && typeof value.payload === "object") {
      const payload = value.payload as Record<string, unknown>
      if (typeof payload.id === "string") {
        draft.sessionId = payload.id
      }
      if (typeof payload.cwd === "string") {
        draft.cwd = payload.cwd
      }
      if (payload.git && typeof payload.git === "object") {
        const git = payload.git as Record<string, unknown>
        if (typeof git.branch === "string") {
          draft.gitBranch = git.branch
        }
      }
      continue
    }

    if (type === "event_msg" && value.payload && typeof value.payload === "object") {
      const payload = value.payload as Record<string, unknown>
      const payloadType = typeof payload.type === "string" ? payload.type : ""
      if (payloadType === "user_message") {
        draft.messageCount += 1
        if (!draft.title && typeof payload.message === "string") {
          draft.title = extractCodexTitleCandidate(payload.message)
        }
      } else if (payloadType === "agent_message") {
        draft.messageCount += 1
      }
      continue
    }

    if (type === "response_item" && value.payload && typeof value.payload === "object") {
      const payload = value.payload as Record<string, unknown>
      if (
        !draft.title &&
        payload.type === "message" &&
        payload.role === "user"
      ) {
        draft.title = extractCodexTitleCandidate(extractResponseText(payload) ?? "")
      }
    }
  }

  if (!draft.sessionId || !draft.cwd || !draft.updatedAt) {
    return null
  }

  return draft
}

export async function loadCodexIndex(): Promise<
  Map<string, CodexSessionIndexEntry> | undefined
> {
  const indexPath = getCodexIndexPath()
  if (!(await pathExists(indexPath))) {
    return undefined
  }

  const raw = await fs.readFile(indexPath, "utf8")
  const map = new Map<string, CodexSessionIndexEntry>()

  for (const line of raw.split(/\r?\n/)) {
    const entry = safeJsonParse<CodexSessionIndexEntry>(line)
    if (entry?.id) {
      map.set(entry.id, entry)
    }
  }

  return map
}

export async function listCodexSessionFiles(): Promise<string[]> {
  const baseDir = getCodexSessionsDir()
  if (!(await pathExists(baseDir))) {
    return []
  }

  const files = await walkFiles(baseDir)
  return files.filter((filePath) => {
    return path.basename(filePath).startsWith("rollout-") && filePath.endsWith(".jsonl")
  })
}

export async function parseCodexSessionFile(
  filePath: string,
  indexMap?: Map<string, CodexSessionIndexEntry>,
): Promise<CachedSessionRecord | null> {
  const raw = await fs.readFile(filePath, "utf8")
  const summary = parseCodexSummaryFromLines(raw.split(/\r?\n/))
  if (!summary) {
    return null
  }

  const sessionId = summary.sessionId as string
  const cwd = summary.cwd as string
  const updatedAt = summary.updatedAt as string
  const indexEntry = indexMap?.get(sessionId)
  const title =
    cleanText(indexEntry?.thread_name ?? "") ??
    cleanText(summary.title ?? "")

  return {
    agent: "codex",
    sessionId,
    cwd,
    title,
    updatedAt: toIsoDate(indexEntry?.updated_at) ?? updatedAt,
    messageCount: summary.messageCount,
    sourceFile: filePath,
    indexFile: indexMap ? getCodexIndexPath() : undefined,
    gitBranch: summary.gitBranch,
  }
}
