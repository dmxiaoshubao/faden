import { spawn } from "node:child_process"

export async function runInteractiveCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<number> {
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
