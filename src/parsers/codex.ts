import os from "node:os"
import path from "node:path"

import { walkFiles, pathExists } from "../fs-utils"
import type {
  CachedSessionRecord,
  CodexSessionIndexEntry,
} from "../types"
import {
  cleanText,
  extractMeaningfulTitle,
  hasProjectInstructions,
  readFileLines,
  safeJsonParse,
  toIsoDate,
} from "./shared"

interface CodexSummaryDraft {
  sessionId: string | null
  cwd: string | null
  title: string | null
  hasProjectInstructions: boolean
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

function updateDraftFromUserText(
  draft: CodexSummaryDraft,
  input: string,
): void {
  if (hasProjectInstructions(input)) {
    draft.hasProjectInstructions = true
  }

  if (!draft.title) {
    draft.title = extractMeaningfulTitle(input)
  }
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
      const candidate = extractMeaningfulTitle(item.text)
      if (candidate) {
        return candidate
      }
    }
  }

  return null
}

function createCodexSummaryDraft(): CodexSummaryDraft {
  return {
    sessionId: null,
    cwd: null,
    title: null,
    hasProjectInstructions: false,
    updatedAt: null,
    gitBranch: null,
    messageCount: 0,
  }
}

function finalizeCodexSummary(draft: CodexSummaryDraft): CodexSummaryDraft | null {
  if (!draft.sessionId || !draft.cwd || !draft.updatedAt) {
    return null
  }

  return draft
}

function updateCodexSummaryDraft(
  draft: CodexSummaryDraft,
  line: string,
): void {
  const value = safeJsonParse<Record<string, unknown>>(line)
  if (!value) {
    return
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
    return
  }

  if (type === "event_msg" && value.payload && typeof value.payload === "object") {
    const payload = value.payload as Record<string, unknown>
    const payloadType = typeof payload.type === "string" ? payload.type : ""
    if (payloadType === "user_message") {
      draft.messageCount += 1
      if (!draft.title && typeof payload.message === "string") {
        updateDraftFromUserText(draft, payload.message)
      }
    } else if (payloadType === "agent_message") {
      draft.messageCount += 1
    }
    return
  }

  if (type === "response_item" && value.payload && typeof value.payload === "object") {
    const payload = value.payload as Record<string, unknown>
    if (
      !draft.title &&
      payload.type === "message" &&
      payload.role === "user"
    ) {
      const content = payload.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (
            item &&
            typeof item === "object" &&
            "text" in item &&
            typeof item.text === "string"
          ) {
            updateDraftFromUserText(draft, item.text)
            if (draft.title) {
              break
            }
          }
        }
        return
      }

      const responseText = extractResponseText(payload)
      if (responseText) {
        draft.title = responseText
      }
    }
  }
}

export function parseCodexSummaryFromLines(lines: string[]): CodexSummaryDraft | null {
  const draft = createCodexSummaryDraft()

  for (const line of lines) {
    updateCodexSummaryDraft(draft, line)
  }

  return finalizeCodexSummary(draft)
}

async function parseCodexSummaryFromFile(
  filePath: string,
): Promise<CodexSummaryDraft | null> {
  const draft = createCodexSummaryDraft()
  await readFileLines(filePath, (line) => {
    updateCodexSummaryDraft(draft, line)
  })
  return finalizeCodexSummary(draft)
}

export async function loadCodexIndex(): Promise<
  Map<string, CodexSessionIndexEntry> | undefined
> {
  const indexPath = getCodexIndexPath()
  if (!(await pathExists(indexPath))) {
    return undefined
  }

  const map = new Map<string, CodexSessionIndexEntry>()
  await readFileLines(indexPath, (line) => {
    const entry = safeJsonParse<CodexSessionIndexEntry>(line)
    if (entry?.id) {
      map.set(entry.id, entry)
    }
  })

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
  const summary = await parseCodexSummaryFromFile(filePath)
  if (!summary) {
    return null
  }

  const sessionId = summary.sessionId as string
  const cwd = summary.cwd as string
  const updatedAt = summary.updatedAt as string
  const indexEntry = indexMap?.get(sessionId)
  const title =
    extractMeaningfulTitle(indexEntry?.thread_name ?? "") ??
    cleanText(summary.title ?? "")

  return {
    agent: "codex",
    sessionId,
    cwd,
    title,
    hasProjectInstructions: summary.hasProjectInstructions,
    updatedAt: toIsoDate(indexEntry?.updated_at) ?? updatedAt,
    messageCount: summary.messageCount,
    sourceFile: filePath,
    indexFile: indexMap ? getCodexIndexPath() : undefined,
    gitBranch: summary.gitBranch,
  }
}
