import test from "node:test"
import assert from "node:assert/strict"

import {
  buildVSCodeWorkspaceOpenArgs,
  buildVSCodeSessionUri,
  formatMissingCommandMessage,
  formatMissingVSCodeCommandMessage,
  formatMissingVSCodeExtensionMessage,
  getVSCodeExtensionId,
  isCommandAvailable,
  parseVSCodeExtensions,
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

test("formatMissingVSCodeCommandMessage explains how to install code shell command", () => {
  const output = formatMissingVSCodeCommandMessage()
  assert.match(output, /未检测到命令 "code"/)
  assert.match(output, /Shell Command: Install 'code' command in PATH/)
})

test("formatMissingVSCodeExtensionMessage shows codex extension id", () => {
  const output = formatMissingVSCodeExtensionMessage("codex")
  assert.match(output, /openai\.chatgpt/)
  assert.match(output, /codex/)
})

test("getVSCodeExtensionId returns official extension ids", () => {
  assert.equal(getVSCodeExtensionId("codex"), "openai.chatgpt")
  assert.equal(getVSCodeExtensionId("claude"), "anthropic.claude-code")
})

test("parseVSCodeExtensions strips blank lines and versions", () => {
  const output = [
    "openai.chatgpt@26.417.40842",
    "",
    "anthropic.claude-code",
  ].join("\n")
  assert.deepEqual(parseVSCodeExtensions(output), [
    "openai.chatgpt",
    "anthropic.claude-code",
  ])
})

test("buildVSCodeSessionUri builds codex local conversation uri", () => {
  const uri = buildVSCodeSessionUri("codex", "019b5de8-4a68-7f11-a39b-59b504ccccff")
  assert.equal(
    uri,
    "vscode://openai.chatgpt/local/019b5de8-4a68-7f11-a39b-59b504ccccff",
  )
})

test("buildVSCodeSessionUri builds claude session uri", () => {
  const uri = buildVSCodeSessionUri("claude", "0c36869a-af8c-427d-9465-80dd30a4d966")
  assert.equal(
    uri,
    "vscode://anthropic.claude-code/open?session=0c36869a-af8c-427d-9465-80dd30a4d966",
  )
})

test("buildVSCodeWorkspaceOpenArgs opens target project in a new window", () => {
  assert.deepEqual(
    buildVSCodeWorkspaceOpenArgs("/tmp/demo-project"),
    ["-n", "/tmp/demo-project"],
  )
})

test("isCommandAvailable returns false for a definitely missing command", () => {
  assert.equal(
    isCommandAvailable("faden-command-that-should-not-exist-for-tests"),
    false,
  )
})
