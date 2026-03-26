import test from "node:test"
import assert from "node:assert/strict"

import { formatSelectableLabel, formatSessionLine } from "../render"
import type { SessionRecord } from "../types"

const baseRecord: SessionRecord = {
  agent: "codex",
  sessionId: "session-1",
  cwd: "/repo/demo",
  title: "会话标题",
  hasProjectInstructions: false,
  alias: null,
  updatedAt: "2026-03-23T02:02:09.000Z",
  messageCount: 1,
  sourceFile: "/tmp/session.jsonl",
  gitBranch: "main",
}

test("formatSessionLine highlights selected codex row beyond the pointer", () => {
  const lines = formatSessionLine(baseRecord, 0, true)
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^\x1b\[1;38;2;191;219;254m▶\x1b\[0m \[codex\] /)
  assert.match(lines[0], /\x1b\[1;38;2;191;219;254m会话标题\x1b\[0m$/)
  assert.match(lines[1], /\x1b\[1;38;2;191;219;254m└\x1b\[0m \x1b\[1;38;2;191;219;254m\/repo\/demo · /)
  assert.doesNotMatch(lines[0], /\x1b\[38;2;217;119;87m/)
})

test("formatSessionLine colors claude label with configured accent", () => {
  const lines = formatSessionLine({ ...baseRecord, agent: "claude" }, 0, false)
  assert.match(lines[0], / \x1b\[38;2;217;119;87m\[claude\]\x1b\[0m /)
})

test("formatSessionLine keeps selected claude label in accent color", () => {
  const lines = formatSessionLine({ ...baseRecord, agent: "claude" }, 0, true)
  assert.match(lines[0], /^\x1b\[1;38;2;191;219;254m▶\x1b\[0m \x1b\[38;2;217;119;87m\[claude\]\x1b\[0m /)
  assert.match(lines[0], /\x1b\[1;38;2;191;219;254m会话标题\x1b\[0m$/)
})

test("formatSelectableLabel reuses selected styling for simple confirmations", () => {
  const line = formatSelectableLabel("确认删除 / Confirm delete", true)
  assert.match(line, /^\x1b\[1;38;2;191;219;254m▶\x1b\[0m \x1b\[1;38;2;191;219;254m确认删除 \/ Confirm delete\x1b\[0m$/)
})

test("formatSessionLine shows unavailable marker when agent command is missing", () => {
  const lines = formatSessionLine(baseRecord, 0, false, false)
  assert.match(lines[1], / · 未安装$/)
})

test("formatSessionLine does not append project-rules marker on the title row", () => {
  const lines = formatSessionLine({ ...baseRecord, hasProjectInstructions: true }, 0, false)
  assert.match(lines[0], /会话标题$/)
  assert.doesNotMatch(lines[0], /有项目规则/)
})
