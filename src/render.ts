import path from "node:path"

import type { SessionRecord } from "./types"

function formatTime(input: string): string {
  return new Date(input).toLocaleString()
}

export function formatSessionLine(
  session: SessionRecord,
  _index: number,
  selected: boolean,
): string {
  const pointer = selected ? ">" : " "
  const title = session.alias || session.title || "(无标题)"
  const cwdLabel = path.basename(session.cwd) || session.cwd
  const branch = session.gitBranch ? ` · ${session.gitBranch}` : ""
  return `${pointer} [${session.agent}] ${title} · ${cwdLabel} · ${formatTime(
    session.updatedAt,
  )}${branch}`
}

export function printAliasBindResult(alias: string, sessionId: string): void {
  console.log(`已绑定别名 "${alias}" -> ${sessionId}`)
}
