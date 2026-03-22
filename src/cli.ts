#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { parseCliArgs } from "./args"
import { runInteractiveCommand } from "./child-process"
import { pathsMatch, resolveInputPath } from "./path-utils"
import { formatSessionLine, printAliasBindResult } from "./render"
import { removeSession } from "./remove"
import { filterSessions, loadAllSessions } from "./sessions"
import { loadState, setAlias } from "./state"
import { confirmAction, selectItem } from "./ui"
import type { AgentName, SessionRecord } from "./types"

function printHelp(): void {
  console.log(`faden

用法:
  faden add [-a codex|claude] [-p path] [-n name] [-- <agent args...>]
  faden resume [-a] [-k key] [-p path] [-- <agent args...>]
  faden remove [-a] [-k key] [-p path]
`)
}

async function ensureDirectoryExists(targetPath: string): Promise<void> {
  const stats = await fs.stat(targetPath).catch(() => null)
  if (!stats || !stats.isDirectory()) {
    throw new Error(`目录不存在: ${targetPath}`)
  }
}

async function chooseAgent(): Promise<AgentName | null> {
  return selectItem({
    title: "请选择要启动的 agent",
    items: ["codex", "claude"] satisfies AgentName[],
    renderItem: (item, _index, selected) => `${selected ? ">" : " "} ${item}`,
  })
}

async function pickSession(sessions: SessionRecord[], title: string): Promise<SessionRecord | null> {
  return selectItem({
    title,
    items: sessions,
    renderItem: formatSessionLine,
    emptyMessage: "没有匹配的会话。",
  })
}

async function handleAdd(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2))
  if (parsed.type !== "add") {
    throw new Error("命令解析失败")
  }

  const options = parsed.options
  const targetPath = resolveInputPath(options.path ?? process.cwd())
  await ensureDirectoryExists(targetPath)

  let agent: AgentName
  if (options.agent) {
    agent = options.agent
  } else {
    const selectedAgent = await chooseAgent()
    if (!selectedAgent) {
      return 1
    }
    agent = selectedAgent
  }

  const state = await loadState()

  if (agent === "claude") {
    if (options.name && options.passthroughArgs.includes("--session-id")) {
      throw new Error("使用 -n 时不要再手动传入 --session-id")
    }
    const sessionId = randomUUID()
    const args = options.name
      ? ["--session-id", sessionId, ...options.passthroughArgs]
      : options.passthroughArgs

    const exitCode = await runInteractiveCommand("claude", args, targetPath)
    if (options.name) {
      const sessions = await loadAllSessions(state)
      const createdSession = sessions.find((session) => {
        return session.agent === "claude" && session.sessionId === sessionId
      })
      if (createdSession) {
        await setAlias(state, "claude", sessionId, options.name)
        printAliasBindResult(options.name, sessionId)
      } else {
        console.warn(`Claude 会话未落盘，别名 "${options.name}" 未绑定。`)
      }
    }

    return exitCode
  }

  const beforeSessions = (await loadAllSessions(state)).filter((session) => {
    return session.agent === "codex" && pathsMatch(session.cwd, targetPath)
  })
  const beforeIds = new Set(beforeSessions.map((session) => session.sessionId))
  const exitCode = await runInteractiveCommand("codex", options.passthroughArgs, targetPath)

  if (options.name) {
    const afterSessions = (await loadAllSessions(state)).filter((session) => {
      return session.agent === "codex" && pathsMatch(session.cwd, targetPath)
    })
    const newSessions = afterSessions.filter((session) => !beforeIds.has(session.sessionId))
    if (newSessions.length === 1) {
      await setAlias(state, "codex", newSessions[0].sessionId, options.name)
      printAliasBindResult(options.name, newSessions[0].sessionId)
    } else {
      console.warn(
        `未能唯一识别新建的 Codex 会话，别名 "${options.name}" 未绑定。`,
      )
    }
  }

  return exitCode
}

async function handleResume(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2))
  if (parsed.type !== "resume") {
    throw new Error("命令解析失败")
  }

  const state = await loadState()
  const targetPath = parsed.options.path
    ? resolveInputPath(parsed.options.path)
    : undefined
  const sessions = filterSessions(await loadAllSessions(state), {
    includeAll: parsed.options.includeAll,
    path: targetPath,
    key: parsed.options.key,
  })

  const selected = await pickSession(sessions, "选择要恢复的会话")
  if (!selected) {
    return 1
  }

  const args =
    selected.agent === "codex"
      ? ["resume", selected.sessionId, ...parsed.options.passthroughArgs]
      : ["--resume", selected.sessionId, ...parsed.options.passthroughArgs]

  const command = selected.agent === "codex" ? "codex" : "claude"
  return runInteractiveCommand(command, args, selected.cwd)
}

async function handleRemove(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2))
  if (parsed.type !== "remove") {
    throw new Error("命令解析失败")
  }

  const state = await loadState()
  const targetPath = parsed.options.path
    ? resolveInputPath(parsed.options.path)
    : undefined
  const sessions = filterSessions(await loadAllSessions(state), {
    includeAll: parsed.options.includeAll,
    path: targetPath,
    key: parsed.options.key,
  })

  const selected = await pickSession(sessions, "选择要删除的会话")
  if (!selected) {
    return 1
  }

  const confirmed = await confirmAction(
    `确认删除 ${selected.agent} 会话 ${selected.sessionId} 吗？`,
  )
  if (!confirmed) {
    return 1
  }

  await removeSession(selected, state)
  console.log(`已删除会话 ${selected.sessionId}`)
  return 0
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2))

  if (parsed.type === "help") {
    printHelp()
    return
  }

  let exitCode = 0
  if (parsed.type === "add") {
    exitCode = await handleAdd()
  } else if (parsed.type === "resume") {
    exitCode = await handleResume()
  } else {
    exitCode = await handleRemove()
  }

  process.exitCode = exitCode
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
