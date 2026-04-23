import { spawn, spawnSync } from "node:child_process"

import type { AgentName, IdeName } from "./types"

const INSTALL_GUIDES: Partial<Record<string, string>> = {
  codex: "https://github.com/openai/codex",
  claude: "https://github.com/anthropics/claude-code",
}

const IDE_CONFIGS: Record<IdeName, {
  label: string
  command: string
  uriScheme: string
}> = {
  vscode: {
    label: "VS Code",
    command: "code",
    uriScheme: "vscode",
  },
  cursor: {
    label: "Cursor",
    command: "cursor",
    uriScheme: "cursor",
  },
  trae: {
    label: "Trae",
    command: "trae",
    uriScheme: "trae",
  },
  windsurf: {
    label: "Windsurf",
    command: "windsurf",
    uriScheme: "windsurf",
  },
  antigravity: {
    label: "Antigravity",
    command: "agy",
    uriScheme: "antigravity",
  },
}

const AGENT_IDE_EXTENSIONS: Record<AgentName, string> = {
  codex: "openai.chatgpt",
  claude: "anthropic.claude-code",
}

interface RunCommandOptions {
  stdio?: "inherit" | "ignore"
}

export interface IdeOpenAvailability {
  available: boolean
  reason?: string
}

export function formatMissingCommandMessage(command: string): string {
  const installGuide = INSTALL_GUIDES[command]
  const lines = [
    `未检测到命令 "${command}"，请先安装后再继续。`,
  ]
  if (installGuide) {
    lines.push(`安装说明: ${installGuide}`)
  }
  return lines.join("\n")
}

export function getIdeLabel(ide: IdeName): string {
  return IDE_CONFIGS[ide].label
}

export function getIdeCommand(ide: IdeName): string {
  return IDE_CONFIGS[ide].command
}

export function getIdeUriScheme(ide: IdeName): string {
  return IDE_CONFIGS[ide].uriScheme
}

export function getSupportedIdeNames(): IdeName[] {
  return Object.keys(IDE_CONFIGS) as IdeName[]
}

export function formatMissingIdeCommandMessage(ide: IdeName): string {
  const command = getIdeCommand(ide)
  const label = getIdeLabel(ide)
  return [
    `未检测到命令 "${command}"，无法在 ${label} 插件中打开会话。`,
    `请先为 ${label} 安装 shell command 到 PATH。`,
  ].join("\n")
}

export function getAgentIdeExtensionId(agent: AgentName): string {
  return AGENT_IDE_EXTENSIONS[agent]
}

export function formatMissingIdeExtensionMessage(agent: AgentName, ide: IdeName): string {
  const extensionId = getAgentIdeExtensionId(agent)
  const ideLabel = getIdeLabel(ide)
  return `未检测到 ${ideLabel} 插件 "${extensionId}"，无法为 ${agent} 打开对应会话。`
}

export function parseIdeExtensions(output: string): string[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("@")[0] ?? line)
}

export function buildIdeSessionUri(
  ide: IdeName,
  agent: AgentName,
  sessionId: string,
): string {
  const uriScheme = getIdeUriScheme(ide)
  const extensionId = getAgentIdeExtensionId(agent)

  if (agent === "codex") {
    return `${uriScheme}://${extensionId}/local/${encodeURIComponent(sessionId)}`
  }

  const params = new URLSearchParams({ session: sessionId })
  return `${uriScheme}://${extensionId}/open?${params.toString()}`
}

export function buildIdeWorkspaceOpenArgs(cwd: string): string[] {
  return ["-n", cwd]
}

export function isCommandAvailable(command: string): boolean {
  if (process.platform === "win32") {
    const result = spawnSync("where", [command], { stdio: "ignore" })
    return result.status === 0
  }

  const result = spawnSync("command", ["-v", command], {
    shell: true,
    stdio: "ignore",
  })
  return result.status === 0
}

export function ensureCommandAvailable(command: string): void {
  if (!isCommandAvailable(command)) {
    throw new Error(formatMissingCommandMessage(command))
  }
}

function ensureIdeCommandAvailable(ide: IdeName): void {
  const command = getIdeCommand(ide)
  if (!isCommandAvailable(command)) {
    throw new Error(formatMissingIdeCommandMessage(ide))
  }
}

export function listIdeExtensions(ide: IdeName): string[] {
  const command = getIdeCommand(ide)
  ensureIdeCommandAvailable(ide)

  const result = spawnSync(command, ["--list-extensions"], {
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  })

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : ""
    throw new Error(stderr || `读取 ${getIdeLabel(ide)} 插件列表失败。`)
  }

  return parseIdeExtensions(result.stdout ?? "")
}

export function isIdeExtensionInstalled(ide: IdeName, agent: AgentName): boolean {
  const extensionId = getAgentIdeExtensionId(agent)
  return listIdeExtensions(ide).includes(extensionId)
}

export function getIdeOpenAvailability(
  ide: IdeName,
  agent: AgentName,
): IdeOpenAvailability {
  const command = getIdeCommand(ide)
  if (!isCommandAvailable(command)) {
    return {
      available: false,
      reason: `未检测到 ${command} 命令`,
    }
  }

  try {
    if (!isIdeExtensionInstalled(ide, agent)) {
      return {
        available: false,
        reason: "未安装对应插件",
      }
    }
  } catch {
    return {
      available: false,
      reason: "无法读取插件列表",
    }
  }

  return { available: true }
}

function ensureIdeOpenAvailable(ide: IdeName, agent: AgentName): void {
  ensureIdeCommandAvailable(ide)
  if (!isIdeExtensionInstalled(ide, agent)) {
    throw new Error(formatMissingIdeExtensionMessage(agent, ide))
  }
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: RunCommandOptions = {},
): Promise<number> {
  ensureCommandAvailable(command)

  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: options.stdio ?? "ignore",
      shell: process.platform === "win32",
    })

    child.on("error", (error) => {
      reject(
        new Error(`启动命令失败: ${command} ${args.join(" ")}\n${String(error)}`),
      )
    })

    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(1)
        return
      }
      resolve(code ?? 0)
    })
  })
}

export async function runInteractiveCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<number> {
  return runCommand(command, args, cwd, { stdio: "inherit" })
}

export async function openSessionInIde(
  ide: IdeName,
  agent: AgentName,
  sessionId: string,
  cwd: string,
): Promise<void> {
  ensureIdeOpenAvailable(ide, agent)

  const command = getIdeCommand(ide)
  const uri = buildIdeSessionUri(ide, agent, sessionId)
  const revealExitCode = await runCommand(
    command,
    buildIdeWorkspaceOpenArgs(cwd),
    cwd,
  )
  if (revealExitCode !== 0) {
    throw new Error(`打开 ${getIdeLabel(ide)} 项目失败，退出码: ${revealExitCode}`)
  }

  const warmupDelayMs = agent === "claude" ? 500 : 200
  await new Promise((resolve) => setTimeout(resolve, warmupDelayMs))

  const openExitCode = await runCommand(command, ["--open-url", uri], cwd)
  if (openExitCode !== 0) {
    throw new Error(`通过 ${getIdeLabel(ide)} 插件打开会话失败，退出码: ${openExitCode}`)
  }
}
