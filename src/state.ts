import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { AgentName, FadenState, SessionCacheFile } from "./types"

const EMPTY_STATE: FadenState = {
  aliases: {},
}

const EMPTY_SESSION_CACHE: SessionCacheFile = {
  version: 1,
  entries: {},
}

function defaultConfigDir(): string {
  if (process.env.FADEN_CONFIG_DIR) {
    return process.env.FADEN_CONFIG_DIR
  }

  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support")
  }

  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
}

export function getStateDir(): string {
  return path.join(defaultConfigDir(), "faden")
}

function getStateFilePath(): string {
  return path.join(getStateDir(), "state.json")
}

function getSessionCacheFilePath(): string {
  return path.join(getStateDir(), "session-cache.json")
}

function aliasKey(agent: AgentName, sessionId: string): string {
  return `${agent}:${sessionId}`
}

export async function loadState(): Promise<FadenState> {
  const filePath = getStateFilePath()
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const parsed = JSON.parse(raw) as Partial<FadenState>
    return {
      aliases: parsed.aliases ?? {},
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return { ...EMPTY_STATE }
    }
    throw error
  }
}

export async function loadSessionCache(): Promise<SessionCacheFile> {
  const filePath = getSessionCacheFilePath()
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const parsed = JSON.parse(raw) as Partial<SessionCacheFile>
    return {
      version: parsed.version ?? EMPTY_SESSION_CACHE.version,
      entries: parsed.entries ?? {},
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return { ...EMPTY_SESSION_CACHE }
    }
    throw error
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dirPath = path.dirname(filePath)
  await fs.mkdir(dirPath, { recursive: true })
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  await fs.writeFile(tempPath, content, "utf8")
  await fs.rename(tempPath, filePath)
}

export async function saveState(state: FadenState): Promise<void> {
  const filePath = getStateFilePath()
  await atomicWrite(filePath, JSON.stringify(state, null, 2))
}

export async function saveSessionCache(cache: SessionCacheFile): Promise<void> {
  const filePath = getSessionCacheFilePath()
  await atomicWrite(filePath, JSON.stringify(cache, null, 2))
}

export function getAlias(
  state: FadenState,
  agent: AgentName,
  sessionId: string,
): string | null {
  return state.aliases[aliasKey(agent, sessionId)]?.alias ?? null
}

export async function setAlias(
  state: FadenState,
  agent: AgentName,
  sessionId: string,
  alias: string,
): Promise<void> {
  state.aliases[aliasKey(agent, sessionId)] = {
    alias,
    updatedAt: new Date().toISOString(),
  }
  await saveState(state)
}

export async function removeAlias(
  state: FadenState,
  agent: AgentName,
  sessionId: string,
): Promise<void> {
  delete state.aliases[aliasKey(agent, sessionId)]
  await saveState(state)
}
