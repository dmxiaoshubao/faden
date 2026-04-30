import type { CommandName } from "./args"

function formatGeneralHelp(): string {
  return `faden

本地 Codex / Claude 会话管理 CLI / Local Codex / Claude session management CLI

用法 / Usage:
  faden <command> [options]

命令 / Commands:
  add       新建会话并可选绑定别名 / Create a session and optionally bind an alias
  resume    选择并恢复已有会话 / Select and resume an existing session
  remove    选择并删除已有会话 / Select and remove an existing session
  alias     为已有会话设置或清除本地别名 / Set or clear a local alias for an existing session
  help      查看总帮助或子命令帮助 / Show general help or command help

更多 / More:
  faden <command> --help
`
}

function formatAddHelp(): string {
  return `faden add

用法 / Usage:
  faden add [codex|claude] [-p path] [-n name] [-- <agent args...>]

参数 / Arguments:
  codex|claude         指定要启动的 agent / Select the agent to start

选项 / Options:
  -p, --path <path>    指定工作目录，默认当前目录 / Set the working directory, defaults to cwd
  -n, --name <name>    创建成功后为会话绑定别名 / Bind an alias after the session is created
  -- <agent args...>   透传给底层 codex / claude 命令 / Pass through to the underlying codex / claude command
`
}

function formatResumeHelp(): string {
  return `faden resume

用法 / Usage:
  faden resume [codex|claude] [-a] [-k key] [-p path] [-- <agent args...>]

参数 / Arguments:
  codex|claude         仅列出指定 agent 的会话 / Only list sessions for the selected agent

选项 / Options:
  -a, --all            不按当前目录过滤，列出所有会话 / List all sessions without filtering by cwd
  -k, --key <key>      按别名、标题或会话 ID 过滤 / Filter by alias, title, or session ID
  -p, --path <path>    仅列出指定目录的会话，与 --all 互斥 / Only list sessions for the given path, mutually exclusive with --all
  -- <agent args...>   透传给 codex resume / claude --resume，仅终端恢复可用 / Pass through to codex resume or claude --resume, only for terminal resume

说明 / Notes:
  选中会话后会再次选择恢复方式：终端恢复（默认）、在支持的 IDE 插件中打开，或在 macOS 上用 Codex App 恢复 Codex 会话
  After picking a session, choose terminal resume (default), a supported IDE extension, or Codex App for Codex sessions on macOS
  Codex App 恢复会在必要时准备本地 Codex 状态；若需要迁移且 App 正在运行，会提示确认是否先关闭 App
  Codex App resume prepares local Codex state when needed; if migration requires closing a running App, faden asks for confirmation first
`
}

function formatRemoveHelp(): string {
  return `faden remove

用法 / Usage:
  faden remove [codex|claude] [-a] [-k key] [-p path]

参数 / Arguments:
  codex|claude         仅列出指定 agent 的会话 / Only list sessions for the selected agent

选项 / Options:
  -a, --all            不按当前目录过滤，列出所有会话 / List all sessions without filtering by cwd
  -k, --key <key>      按别名、标题或会话 ID 过滤 / Filter by alias, title, or session ID
  -p, --path <path>    仅列出指定目录的会话，与 --all 互斥 / Only list sessions for the given path, mutually exclusive with --all
`
}

function formatAliasHelp(): string {
  return `faden alias

用法 / Usage:
  faden alias set [codex|claude] [-a] [-k key] [-p path] <name>
  faden alias clear [codex|claude] [-a] [-k key] [-p path]

参数 / Arguments:
  set                    为选中的会话设置或更新本地别名 / Set or update a local alias for the selected session
  clear                  清除选中会话的本地别名 / Clear the local alias for the selected session
  codex|claude           仅列出指定 agent 的会话 / Only list sessions for the selected agent
  <name>                 要设置的别名 / Alias name to apply

选项 / Options:
  -a, --all              不按当前目录过滤，列出所有会话 / List all sessions without filtering by cwd
  -k, --key <key>        按别名、标题或会话 ID 过滤 / Filter by alias, title, or session ID
  -p, --path <path>      仅列出指定目录的会话，与 --all 互斥 / Only list sessions for the given path, mutually exclusive with --all
`
}

export function renderHelp(command?: CommandName): string {
  if (command === "add") {
    return formatAddHelp()
  }
  if (command === "resume") {
    return formatResumeHelp()
  }
  if (command === "remove") {
    return formatRemoveHelp()
  }
  if (command === "alias") {
    return formatAliasHelp()
  }
  return formatGeneralHelp()
}

export function printHelp(command?: CommandName): void {
  console.log(renderHelp(command))
}
