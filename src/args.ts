import type {
  AddCommandOptions,
  AgentName,
  AliasCommandOptions,
  RemoveCommandOptions,
  ResumeCommandOptions,
} from "./types"

export type CommandName = "add" | "resume" | "remove" | "alias"

type ParsedCommand =
  | { type: "help"; command?: CommandName }
  | { type: "add"; options: AddCommandOptions }
  | { type: "resume"; options: ResumeCommandOptions }
  | { type: "remove"; options: RemoveCommandOptions }
  | { type: "alias"; options: AliasCommandOptions }

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
    if (!arg.startsWith("-") && !options.agent) {
      options.agent = parseAgent(arg)
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
    if (!arg.startsWith("-") && !options.agent) {
      options.agent = parseAgent(arg)
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
    agent: options.agent,
    path: options.path,
    key: options.key,
  }
}

function parseAliasArgs(argv: string[]): AliasCommandOptions {
  const [action, ...rest] = argv
  if (action !== "set" && action !== "clear") {
    throw new Error("alias 命令只支持 set 或 clear")
  }

  let name: string | undefined
  const argsForFilter = [...rest]
  if (action === "set") {
    if (argsForFilter.length === 0) {
      throw new Error("alias set 缺少别名名称")
    }
    name = argsForFilter.pop()
    if (!name || name.startsWith("-")) {
      throw new Error("alias set 缺少别名名称")
    }
  }

  const parsed = parseRemoveArgs(argsForFilter)
  const options: AliasCommandOptions = {
    action,
    includeAll: parsed.includeAll,
  }

  if (parsed.agent) {
    options.agent = parsed.agent
  }
  if (parsed.path) {
    options.path = parsed.path
  }
  if (parsed.key) {
    options.key = parsed.key
  }
  if (name !== undefined) {
    options.name = name
  }

  return options
}

function hasHelpFlag(argv: string[]): boolean {
  const { head } = splitPassthrough(argv)
  return head.includes("--help") || head.includes("-h")
}

function parseCommandName(input: string): CommandName {
  if (input === "add" || input === "resume" || input === "remove" || input === "alias") {
    return input
  }
  throw new Error(`未知命令: ${input}`)
}

export function parseCliArgs(argv: string[]): ParsedCommand {
  const [command, ...rest] = argv

  if (!command || command === "--help" || command === "-h") {
    return { type: "help" }
  }

  if (command === "help") {
    if (rest.length === 0) {
      return { type: "help" }
    }
    return { type: "help", command: parseCommandName(rest[0]) }
  }

  if (command === "add") {
    if (hasHelpFlag(rest)) {
      return { type: "help", command }
    }
    return { type: "add", options: parseAddArgs(rest) }
  }

  if (command === "resume") {
    if (hasHelpFlag(rest)) {
      return { type: "help", command }
    }
    return { type: "resume", options: parseResumeLikeArgs(rest) }
  }

  if (command === "remove") {
    if (hasHelpFlag(rest)) {
      return { type: "help", command }
    }
    return { type: "remove", options: parseRemoveArgs(rest) }
  }

  if (command === "alias") {
    if (hasHelpFlag(rest)) {
      return { type: "help", command }
    }
    return { type: "alias", options: parseAliasArgs(rest) }
  }

  throw new Error(`未知命令: ${command}`)
}
