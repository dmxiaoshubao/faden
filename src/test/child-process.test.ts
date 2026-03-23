import test from "node:test"
import assert from "node:assert/strict"

import {
  formatMissingCommandMessage,
  isCommandAvailable,
} from "../child-process"

test("formatMissingCommandMessage shows codex install guide", () => {
  const output = formatMissingCommandMessage("codex")
  assert.match(output, /未检测到命令 "codex"/)
  assert.match(output, /https:\/\/github\.com\/openai\/codex/)
})

test("formatMissingCommandMessage shows claude install guide", () => {
  const output = formatMissingCommandMessage("claude")
  assert.match(output, /未检测到命令 "claude"/)
  assert.match(output, /https:\/\/github\.com\/anthropics\/claude-code/)
})

test("isCommandAvailable returns false for a definitely missing command", () => {
  assert.equal(
    isCommandAvailable("faden-command-that-should-not-exist-for-tests"),
    false,
  )
})
