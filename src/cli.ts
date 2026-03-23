#!/usr/bin/env node
import { parseCliArgs } from "./args"
import { printHelp } from "./help"
import type { AgentName, AliasCommandOptions, SessionRecord } from "./types"

async function ensureDirectoryExists(targetPath: string): Promise<void> {
  const fs = await import("node:fs/promises")
  const stats = await fs.stat(targetPath).catch(() => null)
  if (!stats || !stats.isDirectory()) {
    throw new Error(`目录不存在: ${targetPath}`)
  }
}

async function chooseAgent(): Promise<AgentName | null> {
  const { selectItem } = await import("./ui")
  return selectItem({
    title: "选择要启动的 Agent / Select an agent to start",
    items: ["codex", "claude"] satisfies AgentName[],
    renderItem: (item, _index, selected) => `${selected ? ">" : " "} ${item}`,
  })
}

async function pickSession(sessions: SessionRecord[], title: string): Promise<SessionRecord | null> {
  const [{ selectItem }, { formatSessionLine }] = await Promise.all([
    import("./ui"),
    import("./render"),
  ])
  return selectItem({
    title,
    items: sessions,
    renderItem: formatSessionLine,
    emptyMessage: "没有匹配的会话。/ No matching sessions.",
  })
}

async function handleAdd(
  options: import("./types").AddCommandOptions,
): Promise<number> {
  const [{ randomUUID }, { resolveInputPath, pathsMatch }, { runInteractiveCommand }, { printAliasBindResult }, { loadAllSessions }, { loadState, setAlias }] =
    await Promise.all([
      import("node:crypto"),
      import("./path-utils"),
      import("./child-process"),
      import("./render"),
      import("./sessions"),
      import("./state"),
    ])

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

async function handleResume(
  options: import("./types").ResumeCommandOptions,
): Promise<number> {
  const [{ resolveInputPath }, { filterSessions, loadAllSessions }, { loadState }, { runInteractiveCommand }] =
    await Promise.all([
      import("./path-utils"),
      import("./sessions"),
      import("./state"),
      import("./child-process"),
    ])

  const state = await loadState()
  const targetPath = options.path
    ? resolveInputPath(options.path)
    : undefined
  const sessions = filterSessions(await loadAllSessions(state), {
    includeAll: options.includeAll,
    agent: options.agent,
    path: targetPath,
    key: options.key,
  })

  const selected = await pickSession(
    sessions,
    "选择要恢复的会话 / Select a session to resume",
  )
  if (!selected) {
    return 1
  }

  const args =
    selected.agent === "codex"
      ? ["resume", selected.sessionId, ...options.passthroughArgs]
      : ["--resume", selected.sessionId, ...options.passthroughArgs]

  const command = selected.agent === "codex" ? "codex" : "claude"
  return runInteractiveCommand(command, args, selected.cwd)
}

async function handleRemove(
  options: import("./types").RemoveCommandOptions,
): Promise<number> {
  const [{ resolveInputPath }, { filterSessions, loadAllSessions }, { removeSession }, { loadState }, { confirmAction }] =
    await Promise.all([
      import("./path-utils"),
      import("./sessions"),
      import("./remove"),
      import("./state"),
      import("./ui"),
    ])

  const state = await loadState()
  const targetPath = options.path
    ? resolveInputPath(options.path)
    : undefined
  const sessions = filterSessions(await loadAllSessions(state), {
    includeAll: options.includeAll,
    agent: options.agent,
    path: targetPath,
    key: options.key,
  })

  const selected = await pickSession(
    sessions,
    "选择要删除的会话 / Select a session to remove",
  )
  if (!selected) {
    return 1
  }

  const confirmed = await confirmAction(
    `确认删除 ${selected.agent} 会话 ${selected.sessionId} 吗？ / Confirm removing ${selected.agent} session ${selected.sessionId}?`,
  )
  if (!confirmed) {
    return 1
  }

  await removeSession(selected, state)
  console.log(`已删除会话 ${selected.sessionId}`)
  return 0
}

async function handleAlias(
  options: AliasCommandOptions,
): Promise<number> {
  const [{ resolveInputPath }, { filterSessions, loadAllSessions }, { loadState, removeAlias, setAlias }] =
    await Promise.all([
      import("./path-utils"),
      import("./sessions"),
      import("./state"),
    ])

  const state = await loadState()
  const targetPath = options.path
    ? resolveInputPath(options.path)
    : undefined
  const sessions = filterSessions(await loadAllSessions(state), {
    includeAll: options.includeAll,
    agent: options.agent,
    path: targetPath,
    key: options.key,
  })

  const title =
    options.action === "set"
      ? "选择要设置别名的会话 / Select a session to set alias"
      : "选择要清除别名的会话 / Select a session to clear alias"
  const selected = await pickSession(sessions, title)
  if (!selected) {
    return 1
  }

  if (options.action === "set") {
    await setAlias(state, selected.agent, selected.sessionId, options.name!)
    console.log(`已将会话 ${selected.sessionId} 的本地别名设置为 "${options.name}"`)
    return 0
  }

  await removeAlias(state, selected.agent, selected.sessionId)
  console.log(`已清除会话 ${selected.sessionId} 的本地别名`)
  return 0
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2))

  if (parsed.type === "help") {
    printHelp(parsed.command)
    return
  }

  let exitCode = 0
  if (parsed.type === "add") {
    exitCode = await handleAdd(parsed.options)
  } else if (parsed.type === "resume") {
    exitCode = await handleResume(parsed.options)
  } else if (parsed.type === "remove") {
    exitCode = await handleRemove(parsed.options)
  } else {
    exitCode = await handleAlias(parsed.options)
  }

  process.exitCode = exitCode
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
