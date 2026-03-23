import test from "node:test"
import assert from "node:assert/strict"

import { parseCliArgs } from "../args"
import { renderHelp } from "../help"

test("parseCliArgs returns general help for top-level help flag", () => {
  assert.deepEqual(parseCliArgs(["--help"]), { type: "help" })
})

test("parseCliArgs returns subcommand help for resume --help", () => {
  assert.deepEqual(parseCliArgs(["resume", "--help"]), {
    type: "help",
    command: "resume",
  })
})

test("parseCliArgs does not treat passthrough help as CLI help", () => {
  assert.deepEqual(parseCliArgs(["resume", "--", "--help"]), {
    type: "resume",
    options: {
      includeAll: false,
      passthroughArgs: ["--help"],
    },
  })
})

test("parseCliArgs accepts positional agent for add", () => {
  assert.deepEqual(parseCliArgs(["add", "claude", "-n", "demo"]), {
    type: "add",
    options: {
      agent: "claude",
      name: "demo",
      passthroughArgs: [],
    },
  })
})

test("parseCliArgs accepts positional agent for resume", () => {
  assert.deepEqual(parseCliArgs(["resume", "codex", "-k", "demo"]), {
    type: "resume",
    options: {
      includeAll: false,
      agent: "codex",
      key: "demo",
      passthroughArgs: [],
    },
  })
})

test("renderHelp shows both short and long resume options", () => {
  const output = renderHelp("resume")
  assert.match(output, /-a, --all/)
  assert.match(output, /-k, --key <key>/)
  assert.match(output, /-p, --path <path>/)
  assert.match(output, /codex\|claude/)
})

test("renderHelp shows remove option descriptions", () => {
  const output = renderHelp("remove")
  assert.match(output, /不按当前目录过滤/)
  assert.match(output, /与 --all 互斥/)
})

test("renderHelp includes English descriptions after Chinese text", () => {
  const output = renderHelp("resume")
  assert.match(output, /用法 \/ Usage:/)
  assert.match(output, /选项 \/ Options:/)
  assert.match(output, /Filter by alias, title, or session ID/)
})
