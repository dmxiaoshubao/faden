import test from "node:test"
import assert from "node:assert/strict"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { parseClaudeSummaryFromLines, parseClaudeSessionFile } from "../parsers/claude"
import { parseCodexSummaryFromLines, parseCodexSessionFile } from "../parsers/codex"

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

test("parseCodexSummaryFromLines extracts summary", () => {
  const summary = parseCodexSummaryFromLines([
    JSON.stringify({
      timestamp: "2026-03-22T04:09:09.422Z",
      type: "session_meta",
      payload: {
        id: "codex-1",
        cwd: "/repo",
        git: { branch: "main" },
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-22T04:10:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "修复会话导入",
      },
    }),
  ])

  assert.ok(summary)
  assert.equal(summary?.sessionId, "codex-1")
  assert.equal(summary?.cwd, "/repo")
  assert.equal(summary?.title, "修复会话导入")
  assert.equal(summary?.gitBranch, "main")
})

test("parseClaudeSummaryFromLines extracts summary", () => {
  const summary = parseClaudeSummaryFromLines([
    JSON.stringify({
      type: "user",
      sessionId: "claude-1",
      cwd: "/repo",
      gitBranch: "dev",
      timestamp: "2026-03-22T02:28:53.752Z",
      message: {
        role: "user",
        content: "继续实现 faden",
      },
    }),
  ])

  assert.ok(summary)
  assert.equal(summary?.sessionId, "claude-1")
  assert.equal(summary?.cwd, "/repo")
  assert.equal(summary?.title, "继续实现 faden")
  assert.equal(summary?.gitBranch, "dev")
})

test("parseCodexSessionFile prefers index title", async () => {
  const tempRoot = await makeTempDir("faden-parse-codex-")
  const filePath = path.join(tempRoot, "rollout.jsonl")
  await fs.writeFile(
    filePath,
    [
      JSON.stringify({
        timestamp: "2026-03-22T04:09:09.422Z",
        type: "session_meta",
        payload: {
          id: "codex-2",
          cwd: "/repo",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T04:10:00.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "原始标题",
        },
      }),
    ].join("\n"),
    "utf8",
  )

  const record = await parseCodexSessionFile(
    filePath,
    new Map([["codex-2", { id: "codex-2", thread_name: "索引标题" }]]),
  )

  assert.equal(record?.title, "索引标题")
})

test("parseClaudeSessionFile prefers index title", async () => {
  const tempRoot = await makeTempDir("faden-parse-claude-")
  const filePath = path.join(tempRoot, "claude.jsonl")
  await fs.writeFile(
    filePath,
    JSON.stringify({
      type: "user",
      sessionId: "claude-2",
      cwd: "/repo",
      timestamp: "2026-03-22T02:28:53.752Z",
      message: {
        role: "user",
        content: "原始标题",
      },
    }),
    "utf8",
  )

  const record = await parseClaudeSessionFile(
    filePath,
    new Map([
      [
        "claude-2",
        {
          sessionId: "claude-2",
          summary: "索引标题",
        },
      ],
    ]),
  )

  assert.equal(record?.title, "索引标题")
})
