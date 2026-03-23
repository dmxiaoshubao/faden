import test from "node:test"
import assert from "node:assert/strict"

import { formatSelectableLabel, formatSessionLine } from "../render"
import type { SessionRecord } from "../types"

const baseRecord: SessionRecord = {
  agent: "codex",
  sessionId: "session-1",
  cwd: "/repo/demo",
  title: "会话标题",
  alias: null,
  updatedAt: "2026-03-23T02:02:09.000Z",
  messageCount: 1,
  sourceFile: "/tmp/session.jsonl",
  gitBranch: "main",
}

test("formatSessionLine highlights selected codex row beyond the pointer", () => {
  const line = formatSessionLine(baseRecord, 0, true)
  assert.match(line, /^\x1b\[1;38;2;191;219;254m▶\x1b\[0m \[codex\] /)
  assert.match(line, /\x1b\[38;2;148;163;184m会话标题 · demo · /)
  assert.doesNotMatch(line, /\x1b\[38;2;217;119;87m/)
})

test("formatSessionLine colors claude label with configured accent", () => {
  const line = formatSessionLine({ ...baseRecord, agent: "claude" }, 0, false)
  assert.match(line, / \x1b\[38;2;217;119;87m\[claude\]\x1b\[0m /)
})

test("formatSessionLine keeps selected claude label in accent color", () => {
  const line = formatSessionLine({ ...baseRecord, agent: "claude" }, 0, true)
  assert.match(line, /^\x1b\[1;38;2;191;219;254m▶\x1b\[0m \x1b\[38;2;217;119;87m\[claude\]\x1b\[0m /)
  assert.match(line, /\x1b\[38;2;148;163;184m会话标题 · demo · /)
})

test("formatSelectableLabel reuses selected styling for simple confirmations", () => {
  const line = formatSelectableLabel("确认删除 / Confirm delete", true)
  assert.match(line, /^\x1b\[1;38;2;191;219;254m▶\x1b\[0m \x1b\[38;2;148;163;184m确认删除 \/ Confirm delete\x1b\[0m$/)
})

test("formatSessionLine shows unavailable marker when agent command is missing", () => {
  const line = formatSessionLine(baseRecord, 0, false, false)
  assert.match(line, / · 未安装$/)
})
