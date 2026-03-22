import test from "node:test"
import assert from "node:assert/strict"

import { parseClaudeSummaryFromLines } from "../parsers/claude"
import { parseCodexSummaryFromLines } from "../parsers/codex"

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
