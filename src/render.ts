import path from "node:path"

import type { SessionRecord } from "./types"

const ANSI_RESET = "\x1b[0m"
const CLAUDE_LABEL_COLOR = "\x1b[38;2;217;119;87m"
const ACTIVE_POINTER_COLOR = "\x1b[1;38;2;191;219;254m"
const ACTIVE_TEXT_COLOR = "\x1b[38;2;148;163;184m"

function formatTime(input: string): string {
  return new Date(input).toLocaleString()
}

function applyStyle(input: string, ansiCode: string): string {
  return `${ansiCode}${input}${ANSI_RESET}`
}

function formatAgentLabel(agent: SessionRecord["agent"]): string {
  const label = `[${agent}]`
  if (agent === "claude") {
    return applyStyle(label, CLAUDE_LABEL_COLOR)
  }
  return label
}

export function formatSelectableLabel(label: string, selected: boolean): string {
  const pointer = selected
    ? applyStyle("▶", ACTIVE_POINTER_COLOR)
    : " "
  const renderedLabel = selected ? applyStyle(label, ACTIVE_TEXT_COLOR) : label
  return `${pointer} ${renderedLabel}`
}

export function formatSessionLine(
  session: SessionRecord,
  _index: number,
  selected: boolean,
): string {
  const pointer = selected
    ? applyStyle("▶", ACTIVE_POINTER_COLOR)
    : " "
  const title = session.alias || session.title || "(无标题)"
  const cwdLabel = path.basename(session.cwd) || session.cwd
  const branch = session.gitBranch ? ` · ${session.gitBranch}` : ""
  const content = `${title} · ${cwdLabel} · ${formatTime(session.updatedAt)}${branch}`
  const renderedContent = selected ? applyStyle(content, ACTIVE_TEXT_COLOR) : content
  return `${pointer} ${formatAgentLabel(session.agent)} ${renderedContent}`
}

export function printAliasBindResult(alias: string, sessionId: string): void {
  console.log(`已绑定别名 "${alias}" -> ${sessionId}`)
}
