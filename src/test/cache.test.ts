import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { loadAllSessions } from "../sessions"
import { loadSessionCache, loadState } from "../state"

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function writeCodexFixture(root: string, threadName: string): Promise<void> {
  const sessionsDir = path.join(root, "codex-home", "sessions", "2026", "03", "22")
  await fs.mkdir(sessionsDir, { recursive: true })
  await fs.writeFile(
    path.join(sessionsDir, "rollout-1.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-03-22T00:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "codex-1",
          cwd: "/repo",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T00:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "原始标题",
        },
      }),
    ].join("\n"),
    "utf8",
  )
  await fs.mkdir(path.join(root, "codex-home"), { recursive: true })
  await fs.writeFile(
    path.join(root, "codex-home", "session_index.jsonl"),
    `${JSON.stringify({
      id: "codex-1",
      thread_name: threadName,
      updated_at: "2026-03-22T00:00:02.000Z",
    })}\n`,
    "utf8",
  )
}

test("loadAllSessions writes cache and refreshes when index changes", async () => {
  const tempRoot = await makeTempDir("faden-cache-")
  process.env.FADEN_CONFIG_DIR = path.join(tempRoot, "config")
  process.env.CODEX_HOME = path.join(tempRoot, "codex-home")
  process.env.CLAUDE_CONFIG_DIR = path.join(tempRoot, "claude-home")

  await writeCodexFixture(tempRoot, "第一次标题")

  const state = await loadState()
  const firstSessions = await loadAllSessions(state)
  assert.equal(firstSessions.length, 1)
  assert.equal(firstSessions[0].title, "第一次标题")

  const firstCache = await loadSessionCache()
  assert.equal(Object.keys(firstCache.entries).length, 1)

  await new Promise((resolve) => setTimeout(resolve, 20))
  await writeCodexFixture(tempRoot, "第二次标题")

  const secondSessions = await loadAllSessions(state)
  assert.equal(secondSessions.length, 1)
  assert.equal(secondSessions[0].title, "第二次标题")

  const secondCache = await loadSessionCache()
  const cachedRecord = Object.values(secondCache.entries)[0]?.record
  assert.equal(cachedRecord?.title, "第二次标题")
})
