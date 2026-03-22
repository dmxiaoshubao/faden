import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { pathExists } from "../fs-utils"
import type {
  CachedSessionRecord,
  ClaudeSessionIndexEntry,
} from "../types"
import {
  cleanText,
  readFileLines,
  safeJsonParse,
  toIsoDate,
  truncate,
} from "./shared"

interface ClaudeSummaryDraft {
  sessionId: string | null
  cwd: string | null
  title: string | null
  updatedAt: string | null
  gitBranch: string | null
  messageCount: number
}

const SYSTEM_TAG_REGEX =
  /<system-reminder>[\s\S]*?<\/system-reminder>|<local-command-caveat>[\s\S]*?<\/local-command-caveat>|<command-name>[\s\S]*?<\/command-name>|<command-message>[\s\S]*?<\/command-message>|<command-args>[\s\S]*?<\/command-args>|<local-command-stdout>[\s\S]*?<\/local-command-stdout>|<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g

export function getClaudeProjectsDir(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")
  return path.join(configDir, "projects")
}

function decodeProjectDirName(input: string): string {
  return input.replace(/-/g, "/")
}

function stripSystemTags(input: string): string | null {
  return cleanText(input.replace(SYSTEM_TAG_REGEX, " "))
}

function extractClaudeUserText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null
  }

  const content = (message as { content?: unknown }).content
  if (typeof content === "string") {
    return stripSystemTags(content)
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        const stripped = stripSystemTags(item.text)
        if (stripped) {
          return stripped
        }
      }
    }
  }

  return null
}

export function parseClaudeSummaryFromLines(lines: string[]): ClaudeSummaryDraft | null {
  const draft = createClaudeSummaryDraft()

  for (const line of lines) {
    updateClaudeSummaryDraft(draft, line)
  }

  return finalizeClaudeSummary(draft)
}

function createClaudeSummaryDraft(): ClaudeSummaryDraft {
  return {
    sessionId: null,
    cwd: null,
    title: null,
    updatedAt: null,
    gitBranch: null,
    messageCount: 0,
  }
}

function finalizeClaudeSummary(
  draft: ClaudeSummaryDraft,
): ClaudeSummaryDraft | null {
  if (!draft.sessionId || !draft.updatedAt) {
    return null
  }

  return draft
}

function updateClaudeSummaryDraft(
  draft: ClaudeSummaryDraft,
  line: string,
): void {
  const value = safeJsonParse<Record<string, unknown>>(line)
  if (!value) {
    return
  }

  const type = typeof value.type === "string" ? value.type : ""
  if (type === "file-history-snapshot" || type === "progress") {
    return
  }

  if (value.isMeta === true) {
    return
  }

  if (!draft.sessionId && typeof value.sessionId === "string") {
    draft.sessionId = value.sessionId
  }
  if (!draft.cwd && typeof value.cwd === "string") {
    draft.cwd = value.cwd
  }
  if (!draft.gitBranch && typeof value.gitBranch === "string") {
    draft.gitBranch = value.gitBranch
  }

  const timestamp = typeof value.timestamp === "string" ? toIsoDate(value.timestamp) : null
  if (timestamp) {
    draft.updatedAt = timestamp
  }

  if (type === "user" || type === "assistant") {
    if (
      type === "assistant" &&
      value.message &&
      typeof value.message === "object" &&
      (value.message as { model?: unknown }).model === "<synthetic>"
    ) {
      return
    }

    draft.messageCount += 1

    if (type === "user" && !draft.title) {
      const text = extractClaudeUserText(value.message)
      if (text) {
        draft.title = truncate(text.replace(/\s+/g, " "), 100)
      }
    }
  }
}

async function parseClaudeSummaryFromFile(
  filePath: string,
): Promise<ClaudeSummaryDraft | null> {
  const draft = createClaudeSummaryDraft()
  await readFileLines(filePath, (line) => {
    updateClaudeSummaryDraft(draft, line)
  })
  return finalizeClaudeSummary(draft)
}

export async function loadClaudeSessionIndex(
  projectDir: string,
): Promise<Map<string, ClaudeSessionIndexEntry> | undefined> {
  const indexPath = path.join(projectDir, "sessions-index.json")
  if (!(await pathExists(indexPath))) {
    return undefined
  }

  const raw = await fs.readFile(indexPath, "utf8")
  const parsed = safeJsonParse<{ entries?: ClaudeSessionIndexEntry[] }>(raw)
  if (!parsed?.entries) {
    return undefined
  }

  return new Map(parsed.entries.map((entry) => [entry.sessionId, entry]))
}

export interface ClaudeSessionFileInfo {
  sourceFile: string
  indexFile?: string
}

export async function listClaudeSessionFiles(): Promise<ClaudeSessionFileInfo[]> {
  const baseDir = getClaudeProjectsDir()
  if (!(await pathExists(baseDir))) {
    return []
  }

  const projectEntries = await fs.readdir(baseDir, { withFileTypes: true })
  const files: ClaudeSessionFileInfo[] = []

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const projectDir = path.join(baseDir, entry.name)
    const indexFile = path.join(projectDir, "sessions-index.json")
    const hasIndexFile = await pathExists(indexFile)
    const projectFiles = await fs.readdir(projectDir, { withFileTypes: true })

    for (const file of projectFiles) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) {
        continue
      }

      files.push({
        sourceFile: path.join(projectDir, file.name),
        indexFile: hasIndexFile ? indexFile : undefined,
      })
    }
  }

  return files
}

export async function parseClaudeSessionFile(
  filePath: string,
  indexMap?: Map<string, ClaudeSessionIndexEntry>,
): Promise<CachedSessionRecord | null> {
  const summary = await parseClaudeSummaryFromFile(filePath)
  if (!summary) {
    return null
  }

  const projectDir = path.dirname(filePath)
  const projectName = path.basename(projectDir)
  const sessionId = summary.sessionId as string
  const updatedAt = summary.updatedAt as string
  const indexEntry = indexMap?.get(sessionId)
  const indexedSummary = cleanText(indexEntry?.summary ?? "")
  const indexedTitle =
    indexedSummary && indexedSummary !== "New Conversation"
      ? indexedSummary
      : cleanText(indexEntry?.firstPrompt ?? "")
  const cwd =
    summary.cwd ??
    cleanText(indexEntry?.projectPath ?? "") ??
    decodeProjectDirName(projectName)

  const title =
    indexedTitle ??
    cleanText(summary.title ?? "")

  return {
    agent: "claude",
    sessionId,
    cwd,
    title,
    updatedAt: toIsoDate(indexEntry?.modified) ?? updatedAt,
    messageCount: indexEntry?.messageCount ?? summary.messageCount,
    sourceFile: filePath,
    indexFile: indexMap ? path.join(projectDir, "sessions-index.json") : undefined,
    gitBranch: cleanText(indexEntry?.gitBranch ?? "") ?? summary.gitBranch,
  }
}
