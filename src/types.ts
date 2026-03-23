export type AgentName = "codex" | "claude"

export interface SessionRecord {
  agent: AgentName
  sessionId: string
  cwd: string
  title: string | null
  alias: string | null
  updatedAt: string
  messageCount: number
  sourceFile: string
  indexFile?: string
  gitBranch?: string | null
}

export interface SessionFilterOptions {
  includeAll: boolean
  agent?: AgentName
  path?: string
  key?: string
}

export interface FadenAliasEntry {
  alias: string
  updatedAt: string
}

export interface FadenState {
  aliases: Record<string, FadenAliasEntry>
}

export interface FileStamp {
  mtimeMs: number
  size: number
}

export interface CachedSessionRecord {
  agent: AgentName
  sessionId: string
  cwd: string
  title: string | null
  updatedAt: string
  messageCount: number
  sourceFile: string
  indexFile?: string
  gitBranch?: string | null
}

export interface SessionCacheEntry {
  record: CachedSessionRecord
  sourceStat: FileStamp
  indexStat?: FileStamp | null
}

export interface SessionCacheFile {
  version: number
  entries: Record<string, SessionCacheEntry>
}

export interface CodexSessionIndexEntry {
  id: string
  thread_name?: string
  updated_at?: string
}

export interface ClaudeSessionIndexEntry {
  sessionId: string
  summary?: string
  firstPrompt?: string
  modified?: string
  messageCount?: number
  projectPath?: string
  gitBranch?: string
}

export interface AddCommandOptions {
  agent?: AgentName
  path?: string
  name?: string
  passthroughArgs: string[]
}

export interface ResumeCommandOptions {
  includeAll: boolean
  agent?: AgentName
  path?: string
  key?: string
  passthroughArgs: string[]
}

export interface RemoveCommandOptions {
  includeAll: boolean
  agent?: AgentName
  path?: string
  key?: string
}
