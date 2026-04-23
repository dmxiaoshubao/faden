import test from "node:test"
import assert from "node:assert/strict"

import {
  buildIdeSessionUri,
  buildIdeWorkspaceOpenArgs,
  formatMissingCommandMessage,
  formatMissingIdeCommandMessage,
  formatMissingIdeExtensionMessage,
  getAgentIdeExtensionId,
  getIdeCommand,
  getIdeLabel,
  getIdeUriScheme,
  getSupportedIdeNames,
  isCommandAvailable,
  parseIdeExtensions,
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

test("formatMissingIdeCommandMessage explains how to install IDE shell command", () => {
  const output = formatMissingIdeCommandMessage("vscode")
  assert.match(output, /未检测到命令 "code"/)
  assert.match(output, /VS Code/)
})

test("formatMissingIdeExtensionMessage shows codex extension id", () => {
  const output = formatMissingIdeExtensionMessage("codex", "cursor")
  assert.match(output, /openai\.chatgpt/)
  assert.match(output, /Cursor/)
  assert.match(output, /codex/)
})

test("getSupportedIdeNames returns built-in IDE presets", () => {
  assert.deepEqual(getSupportedIdeNames(), [
    "vscode",
    "cursor",
    "trae",
    "windsurf",
    "antigravity",
  ])
})

test("getIde metadata returns expected command and scheme", () => {
  assert.equal(getIdeLabel("antigravity"), "Antigravity")
  assert.equal(getIdeCommand("antigravity"), "agy")
  assert.equal(getIdeUriScheme("antigravity"), "antigravity")
})

test("getAgentIdeExtensionId returns official extension ids", () => {
  assert.equal(getAgentIdeExtensionId("codex"), "openai.chatgpt")
  assert.equal(getAgentIdeExtensionId("claude"), "anthropic.claude-code")
})

test("parseIdeExtensions strips blank lines and versions", () => {
  const output = [
    "openai.chatgpt@26.417.40842",
    "",
    "anthropic.claude-code",
  ].join("\n")
  assert.deepEqual(parseIdeExtensions(output), [
    "openai.chatgpt",
    "anthropic.claude-code",
  ])
})

test("buildIdeSessionUri builds codex local conversation uri for VS Code", () => {
  const uri = buildIdeSessionUri("vscode", "codex", "019b5de8-4a68-7f11-a39b-59b504ccccff")
  assert.equal(
    uri,
    "vscode://openai.chatgpt/local/019b5de8-4a68-7f11-a39b-59b504ccccff",
  )
})

test("buildIdeSessionUri builds claude session uri for Antigravity", () => {
  const uri = buildIdeSessionUri("antigravity", "claude", "0c36869a-af8c-427d-9465-80dd30a4d966")
  assert.equal(
    uri,
    "antigravity://anthropic.claude-code/open?session=0c36869a-af8c-427d-9465-80dd30a4d966",
  )
})

test("buildIdeWorkspaceOpenArgs opens target project in a new window", () => {
  assert.deepEqual(
    buildIdeWorkspaceOpenArgs("/tmp/demo-project"),
    ["-n", "/tmp/demo-project"],
  )
})

test("isCommandAvailable returns false for a definitely missing command", () => {
  assert.equal(
    isCommandAvailable("faden-command-that-should-not-exist-for-tests"),
    false,
  )
})
