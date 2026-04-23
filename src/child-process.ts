import { spawn, spawnSync } from "node:child_process"

import type { AgentName } from "./types"

const INSTALL_GUIDES: Partial<Record<string, string>> = {
  codex: "https://github.com/openai/codex",
  claude: "https://github.com/anthropics/claude-code",
}

const VS_CODE_COMMAND = "code"

const VS_CODE_EXTENSIONS: Record<AgentName, string> = {
  codex: "openai.chatgpt",
  claude: "anthropic.claude-code",
}

interface RunCommandOptions {
  stdio?: "inherit" | "ignore"
}

export interface VSCodeOpenAvailability {
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

export function formatMissingVSCodeCommandMessage(): string {
  return [
    `未检测到命令 "${VS_CODE_COMMAND}"，无法在 VS Code 插件中打开会话。`,
    "请先在 VS Code 命令面板执行: Shell Command: Install 'code' command in PATH",
  ].join("\n")
}

export function getVSCodeExtensionId(agent: AgentName): string {
  return VS_CODE_EXTENSIONS[agent]
}

export function formatMissingVSCodeExtensionMessage(agent: AgentName): string {
  const extensionId = getVSCodeExtensionId(agent)
  return `未检测到 VS Code 插件 "${extensionId}"，无法为 ${agent} 打开对应会话。`
}

export function parseVSCodeExtensions(output: string): string[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("@")[0] ?? line)
}

export function buildVSCodeSessionUri(agent: AgentName, sessionId: string): string {
  if (agent === "codex") {
    return `vscode://${getVSCodeExtensionId(agent)}/local/${encodeURIComponent(sessionId)}`
  }

  const params = new URLSearchParams({ session: sessionId })
  return `vscode://${getVSCodeExtensionId(agent)}/open?${params.toString()}`
}

export function buildVSCodeWorkspaceOpenArgs(cwd: string): string[] {
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

function ensureVSCodeCommandAvailable(): void {
  if (!isCommandAvailable(VS_CODE_COMMAND)) {
    throw new Error(formatMissingVSCodeCommandMessage())
  }
}

export function listVSCodeExtensions(): string[] {
  ensureVSCodeCommandAvailable()

  const result = spawnSync(VS_CODE_COMMAND, ["--list-extensions"], {
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  })

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : ""
    throw new Error(stderr || "读取 VS Code 插件列表失败。")
  }

  return parseVSCodeExtensions(result.stdout ?? "")
}

export function isVSCodeExtensionInstalled(agent: AgentName): boolean {
  const extensionId = getVSCodeExtensionId(agent)
  return listVSCodeExtensions().includes(extensionId)
}

export function getVSCodeOpenAvailability(agent: AgentName): VSCodeOpenAvailability {
  if (!isCommandAvailable(VS_CODE_COMMAND)) {
    return {
      available: false,
      reason: "未检测到 code 命令",
    }
  }

  try {
    if (!isVSCodeExtensionInstalled(agent)) {
      return {
        available: false,
        reason: "未安装对应插件",
      }
    }
  } catch {
    return {
      available: false,
      reason: "无法读取 VS Code 插件列表",
    }
  }

  return { available: true }
}

function ensureVSCodeOpenAvailable(agent: AgentName): void {
  ensureVSCodeCommandAvailable()
  if (!isVSCodeExtensionInstalled(agent)) {
    throw new Error(formatMissingVSCodeExtensionMessage(agent))
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

export async function openSessionInVSCode(
  agent: AgentName,
  sessionId: string,
  cwd: string,
): Promise<void> {
  ensureVSCodeOpenAvailable(agent)

  const uri = buildVSCodeSessionUri(agent, sessionId)
  const revealExitCode = await runCommand(
    VS_CODE_COMMAND,
    buildVSCodeWorkspaceOpenArgs(cwd),
    cwd,
  )
  if (revealExitCode !== 0) {
    throw new Error(`打开 VS Code 项目失败，退出码: ${revealExitCode}`)
  }

  const warmupDelayMs = agent === "claude" ? 500 : 200
  await new Promise((resolve) => setTimeout(resolve, warmupDelayMs))

  const openExitCode = await runCommand(VS_CODE_COMMAND, ["--open-url", uri], cwd)
  if (openExitCode !== 0) {
    throw new Error(`通过 VS Code 插件打开会话失败，退出码: ${openExitCode}`)
  }
}
