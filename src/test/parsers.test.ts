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

test("parseCodexSummaryFromLines skips AGENTS noise and keeps instruction marker", () => {
  const summary = parseCodexSummaryFromLines([
    JSON.stringify({
      timestamp: "2026-03-22T04:09:09.422Z",
      type: "session_meta",
      payload: {
        id: "codex-boot",
        cwd: "/repo",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-22T04:10:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\nAlways respond in Chinese-simplified\n</INSTRUCTIONS>",
          },
          {
            type: "input_text",
            text: "<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>",
          },
          {
            type: "input_text",
            text: "修复标题提取",
          },
        ],
      },
    }),
  ])

  assert.ok(summary)
  assert.equal(summary?.title, "修复标题提取")
  assert.equal(summary?.hasProjectInstructions, true)
})

test("parseCodexSummaryFromLines strips IDE setup prefix and keeps real request", () => {
  const summary = parseCodexSummaryFromLines([
    JSON.stringify({
      timestamp: "2026-03-22T04:09:09.422Z",
      type: "session_meta",
      payload: {
        id: "codex-ide",
        cwd: "/repo",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-22T04:10:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "# Context from my IDE setup:\n\n## Active file: codeg/README.md\n\n## Open tabs:\n- README.md: codeg/README.md\n\n## My request for Codex:\n检查一下 README 的结构是否合理",
      },
    }),
  ])

  assert.ok(summary)
  assert.equal(summary?.title, "检查一下 README 的结构是否合理")
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

test("parseClaudeSummaryFromLines skips ide_opened_file noise", () => {
  const summary = parseClaudeSummaryFromLines([
    JSON.stringify({
      type: "user",
      sessionId: "claude-noise",
      cwd: "/repo",
      timestamp: "2026-03-22T02:28:53.752Z",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "<ide_opened_file>The user opened the file /repo/src/app.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>",
          },
          {
            type: "text",
            text: "检查一下这里为什么没走到缓存",
          },
        ],
      },
    }),
  ])

  assert.ok(summary)
  assert.equal(summary?.title, "检查一下这里为什么没走到缓存")
})

test("parseClaudeSummaryFromLines strips IDE setup prefix and keeps real request", () => {
  const summary = parseClaudeSummaryFromLines([
    JSON.stringify({
      type: "user",
      sessionId: "claude-ide",
      cwd: "/repo",
      timestamp: "2026-03-22T02:28:53.752Z",
      message: {
        role: "user",
        content: "# Context from my IDE setup:\n\n## Active file: codeg/README.md\n\n## Open tabs:\n- README.md: codeg/README.md\n\n## My request for Claude:\n看下这个 README 有没有明显问题",
      },
    }),
  ])

  assert.ok(summary)
  assert.equal(summary?.title, "看下这个 README 有没有明显问题")
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

test("parseCodexSessionFile ignores noisy index title", async () => {
  const tempRoot = await makeTempDir("faden-parse-codex-index-")
  const filePath = path.join(tempRoot, "rollout.jsonl")
  await fs.writeFile(
    filePath,
    [
      JSON.stringify({
        timestamp: "2026-03-22T04:09:09.422Z",
        type: "session_meta",
        payload: {
          id: "codex-3",
          cwd: "/repo",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T04:10:00.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "真正的标题",
        },
      }),
    ].join("\n"),
    "utf8",
  )

  const record = await parseCodexSessionFile(
    filePath,
    new Map([[
      "codex-3",
      {
        id: "codex-3",
        thread_name: "# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\nAlways respond in Chinese-simplified\n</INSTRUCTIONS>",
      },
    ]]),
  )

  assert.equal(record?.title, "真正的标题")
})

test("parseCodexSessionFile ignores truncated IDE index title", async () => {
  const tempRoot = await makeTempDir("faden-parse-codex-index-truncated-")
  const filePath = path.join(tempRoot, "rollout.jsonl")
  await fs.writeFile(
    filePath,
    [
      JSON.stringify({
        timestamp: "2026-03-22T04:09:09.422Z",
        type: "session_meta",
        payload: {
          id: "codex-4",
          cwd: "/repo",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T04:10:00.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "真正的索引回退标题",
        },
      }),
    ].join("\n"),
    "utf8",
  )

  const record = await parseCodexSessionFile(
    filePath,
    new Map([[
      "codex-4",
      {
        id: "codex-4",
        thread_name: "# Context from my IDE setup: ## Active file: README.md ## Open tabs: - README.md: README.md ## My ...",
      },
    ]]),
  )

  assert.equal(record?.title, "真正的索引回退标题")
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

test("parseClaudeSessionFile ignores noisy index title", async () => {
  const tempRoot = await makeTempDir("faden-parse-claude-index-")
  const filePath = path.join(tempRoot, "claude.jsonl")
  await fs.writeFile(
    filePath,
    JSON.stringify({
      type: "user",
      sessionId: "claude-3",
      cwd: "/repo",
      timestamp: "2026-03-22T02:28:53.752Z",
      message: {
        role: "user",
        content: "真正的 Claude 标题",
      },
    }),
    "utf8",
  )

  const record = await parseClaudeSessionFile(
    filePath,
    new Map([
      [
        "claude-3",
        {
          sessionId: "claude-3",
          summary: "<ide_opened_file>The user opened the file /repo/src/app.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>",
        },
      ],
    ]),
  )

  assert.equal(record?.title, "真正的 Claude 标题")
})

test("parseClaudeSessionFile ignores truncated IDE index title", async () => {
  const tempRoot = await makeTempDir("faden-parse-claude-index-truncated-")
  const filePath = path.join(tempRoot, "claude.jsonl")
  await fs.writeFile(
    filePath,
    JSON.stringify({
      type: "user",
      sessionId: "claude-4",
      cwd: "/repo",
      timestamp: "2026-03-22T02:28:53.752Z",
      message: {
        role: "user",
        content: "真正的 Claude 回退标题",
      },
    }),
    "utf8",
  )

  const record = await parseClaudeSessionFile(
    filePath,
    new Map([
      [
        "claude-4",
        {
          sessionId: "claude-4",
          summary: "# Context from my IDE setup: ## Active file: README.md ## Open tabs: - README.md: README.md ## My ...",
        },
      ],
    ]),
  )

  assert.equal(record?.title, "真正的 Claude 回退标题")
})
