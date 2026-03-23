import test from "node:test"
import assert from "node:assert/strict"

import { filterSessions } from "../sessions"
import type { SessionRecord } from "../types"

const sampleSessions: SessionRecord[] = [
  {
    agent: "codex",
    sessionId: "one",
    cwd: "/repo",
    title: "修复导入",
    alias: "alpha",
    updatedAt: "2026-03-22T00:00:00.000Z",
    messageCount: 1,
    sourceFile: "/tmp/one.jsonl",
  },
  {
    agent: "claude",
    sessionId: "two",
    cwd: "/other",
    title: "别的项目",
    alias: null,
    updatedAt: "2026-03-21T00:00:00.000Z",
    messageCount: 1,
    sourceFile: "/tmp/two.jsonl",
  },
]

test("filterSessions matches current path by default", () => {
  const result = filterSessions(
    sampleSessions,
    { includeAll: false },
    "/repo",
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].sessionId, "one")
})

test("filterSessions matches key against alias and title", () => {
  const result = filterSessions(sampleSessions, {
    includeAll: true,
    key: "alpha",
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].sessionId, "one")
})

test("filterSessions matches agent filter", () => {
  const result = filterSessions(sampleSessions, {
    includeAll: true,
    agent: "claude",
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].sessionId, "two")
})
