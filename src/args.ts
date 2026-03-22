import type {
  AddCommandOptions,
  AgentName,
  RemoveCommandOptions,
  ResumeCommandOptions,
} from "./types"

type ParsedCommand =
  | { type: "help" }
  | { type: "add"; options: AddCommandOptions }
  | { type: "resume"; options: ResumeCommandOptions }
  | { type: "remove"; options: RemoveCommandOptions }

function splitPassthrough(argv: string[]): { head: string[]; passthrough: string[] } {
  const separatorIndex = argv.indexOf("--")
  if (separatorIndex === -1) {
    return { head: argv, passthrough: [] }
  }
  return {
    head: argv.slice(0, separatorIndex),
    passthrough: argv.slice(separatorIndex + 1),
  }
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value) {
    throw new Error(`${flag} 缺少参数值`)
  }
  return value
}

function parseAgent(value: string): AgentName {
  if (value === "codex" || value === "claude") {
    return value
  }
  throw new Error(`不支持的 agent: ${value}`)
}

function parseAddArgs(argv: string[]): AddCommandOptions {
  const { head, passthrough } = splitPassthrough(argv)
  const options: AddCommandOptions = {
    passthroughArgs: passthrough,
  }

  for (let index = 0; index < head.length; index += 1) {
    const arg = head[index]
    if (arg === "-a" || arg === "--agent") {
      options.agent = parseAgent(readValue(head, index, arg))
      index += 1
      continue
    }
    if (arg === "-p" || arg === "--path") {
      options.path = readValue(head, index, arg)
      index += 1
      continue
    }
    if (arg === "-n" || arg === "--name") {
      options.name = readValue(head, index, arg)
      index += 1
      continue
    }
    throw new Error(`未知参数: ${arg}`)
  }

  return options
}

function parseResumeLikeArgs(argv: string[]): ResumeCommandOptions {
  const { head, passthrough } = splitPassthrough(argv)
  const options: ResumeCommandOptions = {
    includeAll: false,
    passthroughArgs: passthrough,
  }

  for (let index = 0; index < head.length; index += 1) {
    const arg = head[index]
    if (arg === "-a" || arg === "--all") {
      options.includeAll = true
      continue
    }
    if (arg === "-k" || arg === "--key") {
      options.key = readValue(head, index, arg)
      index += 1
      continue
    }
    if (arg === "-p" || arg === "--path") {
      options.path = readValue(head, index, arg)
      index += 1
      continue
    }
    throw new Error(`未知参数: ${arg}`)
  }

  if (options.includeAll && options.path) {
    throw new Error("--all 与 --path 不能同时使用")
  }

  return options
}

function parseRemoveArgs(argv: string[]): RemoveCommandOptions {
  const options = parseResumeLikeArgs(argv)
  return {
    includeAll: options.includeAll,
    path: options.path,
    key: options.key,
  }
}

export function parseCliArgs(argv: string[]): ParsedCommand {
  const [command, ...rest] = argv

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { type: "help" }
  }

  if (command === "add") {
    return { type: "add", options: parseAddArgs(rest) }
  }

  if (command === "resume") {
    return { type: "resume", options: parseResumeLikeArgs(rest) }
  }

  if (command === "remove") {
    return { type: "remove", options: parseRemoveArgs(rest) }
  }

  throw new Error(`未知命令: ${command}`)
}
