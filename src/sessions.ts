import { loadClaudeSessions } from "./parsers/claude"
import { loadCodexSessions } from "./parsers/codex"
import { pathsMatch } from "./path-utils"
import type { FadenState, SessionFilterOptions, SessionRecord } from "./types"

export function sortSessions(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((left, right) => {
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

export function filterSessions(
  sessions: SessionRecord[],
  options: SessionFilterOptions,
  currentWorkingDir = process.cwd(),
): SessionRecord[] {
  const targetPath = options.includeAll ? undefined : options.path ?? currentWorkingDir
  const key = options.key?.trim().toLowerCase()

  return sessions.filter((session) => {
    if (targetPath && !pathsMatch(session.cwd, targetPath)) {
      return false
    }

    if (!key) {
      return true
    }

    const haystack = [
      session.alias,
      session.title,
      session.sessionId,
      session.cwd,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    return haystack.includes(key)
  })
}

export async function loadAllSessions(state: FadenState): Promise<SessionRecord[]> {
  const [codexSessions, claudeSessions] = await Promise.all([
    loadCodexSessions(state),
    loadClaudeSessions(state),
  ])

  return sortSessions([...codexSessions, ...claudeSessions])
}
