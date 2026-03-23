import { spawn, spawnSync } from "node:child_process"

const INSTALL_GUIDES: Partial<Record<string, string>> = {
  codex: "https://github.com/openai/codex",
  claude: "https://github.com/anthropics/claude-code",
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

export async function runInteractiveCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<number> {
  ensureCommandAvailable(command)

  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
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
