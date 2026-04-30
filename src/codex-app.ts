import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { atomicWriteFile, pathExists } from "./fs-utils"
import { getCodexHome } from "./parsers/codex"
import type { SessionRecord } from "./types"

const CODEX_APP_SOURCE = "cli"
const CODEX_APP_ORIGINATOR = "codex_cli_rs"
const DEFAULT_DEEPLINK_DELAY_MS = 3_000
const DEFAULT_QUIT_TIMEOUT_MS = 10_000

export interface CodexThreadRecord {
  id: string
  rolloutPath: string
  source: string
  modelProvider: string
  updatedAt: number
  updatedAtMs: number | null
}

interface CommandRunnerResult {
  status: number | null
  stdout?: string
  stderr?: string
}

interface CommandRunner {
  (command: string, args: string[], input?: string): CommandRunnerResult
}

export interface CodexAppOptions {
  platform?: NodeJS.Platform
  dbPath?: string
  configPath?: string
  now?: Date
  runCommand?: CommandRunner
  sleep?: (ms: number) => Promise<void>
  codexAppPath?: string
  confirmQuit?: (message: string, options?: { confirmLabel?: string, cancelLabel?: string }) => Promise<boolean>
}

export interface OpenCodexAppSessionOptions extends CodexAppOptions {
  deeplinkDelayMs?: number
}

export interface PrepareCodexAppSessionResult {
  migrated: boolean
  cancelled: boolean
  modelProvider: string
}

interface RolloutSessionMeta {
  type?: unknown
  payload?: unknown
  [key: string]: unknown
}

function defaultRunCommand(command: string, args: string[], input?: string): CommandRunnerResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  })
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function quoteSqlString(input: string): string {
  return `'${input.replaceAll("'", "''")}'`
}

function runSqlite(dbPath: string, sql: string, runCommand: CommandRunner = defaultRunCommand): string {
  const result = runCommand("sqlite3", [dbPath], sql)
  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    throw new Error(stderr || `sqlite3 执行失败: ${dbPath}`)
  }
  return result.stdout ?? ""
}

function getPlatform(options: CodexAppOptions = {}): NodeJS.Platform {
  return options.platform ?? process.platform
}

function getRunner(options: CodexAppOptions = {}): CommandRunner {
  return options.runCommand ?? defaultRunCommand
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRolloutSessionMeta(line: string, rolloutPath: string): RolloutSessionMeta {
  const first = JSON.parse(line) as RolloutSessionMeta
  if (first.type !== "session_meta" || !first.payload || typeof first.payload !== "object") {
    throw new Error(`Codex 会话首行不是 session_meta: ${rolloutPath}`)
  }
  return first
}

function getPayload(meta: RolloutSessionMeta): Record<string, unknown> {
  return meta.payload as Record<string, unknown>
}

async function readRolloutSessionMeta(rolloutPath: string): Promise<RolloutSessionMeta> {
  const content = await fs.readFile(rolloutPath, "utf8")
  const firstLine = content.split(/\r?\n/u)[0]
  if (!firstLine) {
    throw new Error(`Codex 会话文件为空: ${rolloutPath}`)
  }
  return parseRolloutSessionMeta(firstLine, rolloutPath)
}

export function isMacOS(options: CodexAppOptions = {}): boolean {
  return getPlatform(options) === "darwin"
}

export function getCodexStateDbPath(): string {
  return path.join(getCodexHome(), "state_5.sqlite")
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHome(), "config.toml")
}

export function buildCodexAppSessionUri(sessionId: string): string {
  return `codex://threads/${encodeURIComponent(sessionId)}`
}

export async function isCodexAppInstalled(options: CodexAppOptions = {}): Promise<boolean> {
  if (!isMacOS(options)) {
    return false
  }

  if (await pathExists(options.codexAppPath ?? "/Applications/Codex.app")) {
    return true
  }

  const result = getRunner(options)("open", ["-Ra", "Codex"])
  return result.status === 0
}

export function isCodexAppRunning(options: CodexAppOptions = {}): boolean {
  if (!isMacOS(options)) {
    return false
  }
  const result = getRunner(options)("pgrep", ["-x", "Codex"])
  return result.status === 0
}

export async function quitCodexApp(options: CodexAppOptions = {}): Promise<void> {
  const runCommand = getRunner(options)
  const sleep = options.sleep ?? defaultSleep
  const result = runCommand("osascript", ["-e", "tell application \"Codex\" to quit"])
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "退出 Codex App 失败。")
  }

  const timeoutMs = DEFAULT_QUIT_TIMEOUT_MS
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (!isCodexAppRunning(options)) {
      return
    }
    await sleep(200)
  }
  throw new Error("等待 Codex App 退出超时。")
}

export async function getCurrentCodexModelProvider(configPath = getCodexConfigPath()): Promise<string> {
  const content = await fs.readFile(configPath, "utf8")
  const match = content.match(/^model_provider\s*=\s*["']([^"']+)["']/mu)
  if (!match?.[1]) {
    throw new Error(`未能从 ${configPath} 读取 model_provider`)
  }
  return match[1]
}

export async function resolveCodexAppModelProvider(
  record: CodexThreadRecord,
  options: CodexAppOptions = {},
): Promise<string> {
  try {
    return await getCurrentCodexModelProvider(options.configPath ?? getCodexConfigPath())
  } catch {
    return record.modelProvider
  }
}

export function getCodexThreadRecord(
  sessionId: string,
  dbPath = getCodexStateDbPath(),
  options: CodexAppOptions = {},
): CodexThreadRecord | null {
  const output = runSqlite(dbPath, [
    ".mode tabs",
    `select id, rollout_path, source, model_provider, updated_at, updated_at_ms from threads where id = ${quoteSqlString(sessionId)};`,
  ].join("\n"), getRunner(options)).trim()

  if (!output) {
    return null
  }

  const [id, rolloutPath, source, modelProvider, updatedAt, updatedAtMs] = output.split("\t")
  if (!id || !rolloutPath || !source || !modelProvider || !updatedAt) {
    throw new Error(`Codex 线程记录格式异常: ${sessionId}`)
  }

  return {
    id,
    rolloutPath,
    source,
    modelProvider,
    updatedAt: Number(updatedAt),
    updatedAtMs: updatedAtMs ? Number(updatedAtMs) : null,
  }
}

export async function isCodexAppReadyThread(
  record: CodexThreadRecord,
): Promise<boolean> {
  if (record.source !== CODEX_APP_SOURCE) {
    return false
  }

  const meta = await readRolloutSessionMeta(record.rolloutPath)
  const payload = getPayload(meta)
  return payload.originator === CODEX_APP_ORIGINATOR &&
    payload.source === CODEX_APP_SOURCE &&
    payload.model_provider === record.modelProvider
}

export async function backupCodexAppMigrationTarget(
  record: CodexThreadRecord,
  dbPath = getCodexStateDbPath(),
  options: CodexAppOptions = {},
): Promise<void> {
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-")
  await fs.copyFile(record.rolloutPath, `${record.rolloutPath}.faden-backup-${stamp}`)
  runSqlite(dbPath, `.backup ${quoteSqlString(`${dbPath}.faden-backup-${stamp}`)}`, getRunner(options))
}

export async function updateRolloutForCodexApp(
  rolloutPath: string,
  modelProvider: string,
): Promise<void> {
  const content = await fs.readFile(rolloutPath, "utf8")
  const trailingNewline = content.endsWith("\n")
  const lines = content.split(/\r?\n/u)
  if (lines.at(-1) === "") {
    lines.pop()
  }
  if (lines.length === 0 || !lines[0]) {
    throw new Error(`Codex 会话文件为空: ${rolloutPath}`)
  }

  const first = parseRolloutSessionMeta(lines[0], rolloutPath)
  const payload = getPayload(first)
  payload.originator = CODEX_APP_ORIGINATOR
  payload.source = CODEX_APP_SOURCE
  payload.model_provider = modelProvider
  lines[0] = JSON.stringify(first)

  await atomicWriteFile(rolloutPath, `${lines.join("\n")}${trailingNewline ? "\n" : ""}`)
}

export function updateThreadForCodexApp(
  sessionId: string,
  modelProvider: string,
  now = new Date(),
  dbPath = getCodexStateDbPath(),
  options: CodexAppOptions = {},
): void {
  const updatedAtMs = now.getTime()
  const updatedAt = Math.floor(updatedAtMs / 1000)
  runSqlite(dbPath, [
    "BEGIN IMMEDIATE;",
    "UPDATE threads SET",
    `source = ${quoteSqlString(CODEX_APP_SOURCE)},`,
    `model_provider = ${quoteSqlString(modelProvider)},`,
    `updated_at = ${updatedAt},`,
    `updated_at_ms = ${updatedAtMs}`,
    `WHERE id = ${quoteSqlString(sessionId)};`,
    "COMMIT;",
  ].join("\n"), getRunner(options))
}

export async function prepareCodexAppSession(
  session: SessionRecord,
  options: CodexAppOptions = {},
): Promise<PrepareCodexAppSessionResult> {
  if (session.agent !== "codex") {
    throw new Error("Codex App 恢复仅支持 Codex 会话。")
  }
  if (!isMacOS(options)) {
    throw new Error("Codex App 恢复当前仅支持 macOS。")
  }
  if (!(await isCodexAppInstalled(options))) {
    throw new Error("未检测到 Codex App，请先安装 Codex App，或改用终端/IDE 恢复。")
  }

  const dbPath = options.dbPath ?? getCodexStateDbPath()
  const record = getCodexThreadRecord(session.sessionId, dbPath, options)
  if (!record) {
    throw new Error(`未找到 Codex 会话索引: ${session.sessionId}`)
  }

  if (await isCodexAppReadyThread(record)) {
    return { migrated: false, cancelled: false, modelProvider: record.modelProvider }
  }

  const modelProvider = await resolveCodexAppModelProvider(record, options)
  if (isCodexAppRunning(options)) {
    const message = [
      "该 Codex 会话需要先修正本地状态才能在 Codex App 中打开。",
      "为避免 Codex App 回写覆盖，请先关闭 Codex App。",
      "是否由 faden 帮你关闭 Codex App 并继续？",
      "This Codex session needs local state repair",
      "before it can be opened in Codex App.",
      "To avoid Codex App overwriting local changes,",
      "please close Codex App first.",
      "Should faden close Codex App for you and continue?",
    ].join("\n")
    const confirmed = options.confirmQuit ? await options.confirmQuit(message, {
      confirmLabel: "关闭 Codex App 并继续 / Close Codex App and continue",
      cancelLabel: "取消 / Cancel",
    }) : false
    if (!confirmed) {
      return { migrated: false, cancelled: true, modelProvider }
    }
    await quitCodexApp(options)
  }

  await backupCodexAppMigrationTarget(record, dbPath, options)
  await updateRolloutForCodexApp(record.rolloutPath, modelProvider)
  updateThreadForCodexApp(session.sessionId, modelProvider, options.now ?? new Date(), dbPath, options)
  return { migrated: true, cancelled: false, modelProvider }
}

export async function openCodexAppSession(
  sessionId: string,
  options: OpenCodexAppSessionOptions = {},
): Promise<void> {
  if (!isMacOS(options)) {
    throw new Error("Codex App 打开方式当前仅支持 macOS。")
  }

  const runCommand = getRunner(options)
  const openApp = runCommand("open", ["-a", "Codex"])
  if (openApp.status !== 0) {
    throw new Error(openApp.stderr?.trim() || "打开 Codex App 失败。")
  }

  await (options.sleep ?? defaultSleep)(options.deeplinkDelayMs ?? DEFAULT_DEEPLINK_DELAY_MS)

  const openThread = runCommand("open", [buildCodexAppSessionUri(sessionId)])
  if (openThread.status !== 0) {
    throw new Error(openThread.stderr?.trim() || `打开 Codex App 会话失败: ${sessionId}`)
  }
}
