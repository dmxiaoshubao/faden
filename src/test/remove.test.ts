import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { removeSession } from "../remove"
import { loadState, setAlias } from "../state"
import type { SessionRecord } from "../types"

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

test("removeSession removes codex rollout file and session index entry", async () => {
  const tempRoot = await makeTempDir("faden-codex-remove-")
  process.env.FADEN_CONFIG_DIR = path.join(tempRoot, "config")

  const sessionFile = path.join(tempRoot, "rollout-1.jsonl")
  const indexFile = path.join(tempRoot, "session_index.jsonl")
  await fs.writeFile(sessionFile, "content\n", "utf8")
  await fs.writeFile(
    indexFile,
    `${JSON.stringify({ id: "keep", thread_name: "keep" })}\n${JSON.stringify({
      id: "delete-me",
      thread_name: "remove",
    })}\n`,
    "utf8",
  )

  const state = await loadState()
  await setAlias(state, "codex", "delete-me", "demo")

  const record: SessionRecord = {
    agent: "codex",
    sessionId: "delete-me",
    cwd: "/repo",
    title: "remove",
    alias: "demo",
    updatedAt: "2026-03-22T00:00:00.000Z",
    messageCount: 1,
    sourceFile: sessionFile,
    indexFile,
  }

  await removeSession(record, state)

  await assert.rejects(() => fs.access(sessionFile))
  const indexContent = await fs.readFile(indexFile, "utf8")
  assert.match(indexContent, /"keep"/)
  assert.doesNotMatch(indexContent, /delete-me/)

  const savedState = await loadState()
  assert.equal(savedState.aliases["codex:delete-me"], undefined)
})

test("removeSession removes claude jsonl and sessions-index entry", async () => {
  const tempRoot = await makeTempDir("faden-claude-remove-")
  process.env.FADEN_CONFIG_DIR = path.join(tempRoot, "config")

  const sessionFile = path.join(tempRoot, "delete-me.jsonl")
  const indexFile = path.join(tempRoot, "sessions-index.json")
  await fs.writeFile(sessionFile, "content\n", "utf8")
  await fs.writeFile(
    indexFile,
    `${JSON.stringify(
      {
        version: 1,
        entries: [
          { sessionId: "keep", summary: "keep" },
          { sessionId: "delete-me", summary: "remove" },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  const state = await loadState()
  await setAlias(state, "claude", "delete-me", "demo")

  const record: SessionRecord = {
    agent: "claude",
    sessionId: "delete-me",
    cwd: "/repo",
    title: "remove",
    alias: "demo",
    updatedAt: "2026-03-22T00:00:00.000Z",
    messageCount: 1,
    sourceFile: sessionFile,
    indexFile,
  }

  await removeSession(record, state)

  await assert.rejects(() => fs.access(sessionFile))
  const parsed = JSON.parse(await fs.readFile(indexFile, "utf8")) as {
    entries: Array<{ sessionId: string }>
  }
  assert.deepEqual(
    parsed.entries.map((entry) => entry.sessionId),
    ["keep"],
  )

  const savedState = await loadState()
  assert.equal(savedState.aliases["claude:delete-me"], undefined)
})
