import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  buildCodexAppSessionUri,
  getCodexThreadRecord,
  getCurrentCodexModelProvider,
  isCodexAppInstalled,
  isCodexAppListedThread,
  isCodexAppReadyThread,
  openCodexAppSession,
  prepareCodexAppSession,
  resolveCodexAppModelProvider,
  updateRolloutForCodexApp,
  updateThreadForCodexApp,
  type CodexThreadRecord,
} from "../codex-app"
import type { SessionRecord } from "../types"

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "faden-codex-app-test-"))
}

function runSqlite(dbPath: string, sql: string): void {
  const result = spawnSync("sqlite3", [dbPath], {
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }
}

async function createRollout(
  rolloutPath: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await fs.writeFile(rolloutPath, [
    JSON.stringify({
      timestamp: "2026-04-30T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-old",
        originator: "old_originator",
        source: "exec",
        model_provider: "old",
        ...payload,
      },
    }),
    JSON.stringify({ type: "response_item", payload: { type: "message" } }),
    "",
  ].join("\n"), "utf8")
}

async function createStateDb(dbPath: string, rolloutPath: string): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true })
  runSqlite(dbPath, [
    "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, source TEXT NOT NULL, model_provider TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_at_ms INTEGER, archived INTEGER DEFAULT 0);",
    `INSERT INTO threads (id, rollout_path, source, model_provider, updated_at, updated_at_ms, archived) VALUES ('session-old', '${rolloutPath.replaceAll("'", "''")}', 'exec', 'old', 10, 10000, 0);`,
    `INSERT INTO threads (id, rollout_path, source, model_provider, updated_at, updated_at_ms, archived) VALUES ('session-ready', '${rolloutPath.replaceAll("'", "''")}', 'cli', 'current', 20, 20000, 0);`,
  ].join("\n"))
}

function codexSession(sessionId = "session-old"): SessionRecord {
  return {
    agent: "codex",
    sessionId,
    cwd: "/tmp/project",
    title: null,
    alias: null,
    updatedAt: "2026-04-30T00:00:00.000Z",
    messageCount: 1,
    sourceFile: "rollout.jsonl",
  }
}

test("buildCodexAppSessionUri builds Codex App thread uri", () => {
  assert.equal(
    buildCodexAppSessionUri("019b5de8-4a68-7f11-a39b-59b504ccccff"),
    "codex://threads/019b5de8-4a68-7f11-a39b-59b504ccccff",
  )
})

test("isCodexAppInstalled is false outside macOS", async () => {
  assert.equal(await isCodexAppInstalled({ platform: "linux" }), false)
})

test("getCurrentCodexModelProvider reads model_provider from config", async () => {
  const dir = await makeTempDir()
  const configPath = path.join(dir, "config.toml")
  await fs.writeFile(configPath, "model_provider = \"packycode\"\nmodel = \"gpt\"\n", "utf8")
  assert.equal(await getCurrentCodexModelProvider(configPath), "packycode")
})

test("resolveCodexAppModelProvider prefers config and falls back to thread provider", async () => {
  const dir = await makeTempDir()
  const configPath = path.join(dir, "config.toml")
  const record = { modelProvider: "thread-provider" } as CodexThreadRecord

  await fs.writeFile(configPath, "model_provider = \"config-provider\"\n", "utf8")
  assert.equal(await resolveCodexAppModelProvider(record, { configPath }), "config-provider")
  assert.equal(
    await resolveCodexAppModelProvider(record, { configPath: path.join(dir, "missing.toml") }),
    "thread-provider",
  )
})

test("updateRolloutForCodexApp updates first session_meta and keeps rest of jsonl", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  await createRollout(rolloutPath)

  await updateRolloutForCodexApp(rolloutPath, "current")

  const lines = (await fs.readFile(rolloutPath, "utf8")).split("\n")
  const first = JSON.parse(lines[0])
  assert.equal(first.payload.originator, "codex_cli_rs")
  assert.equal(first.payload.source, "cli")
  assert.equal(first.payload.model_provider, "current")
  assert.equal(JSON.parse(lines[1]).type, "response_item")
  assert.equal(lines[2], "")
})

test("thread helpers read and update sqlite state", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  const dbPath = path.join(dir, "state.sqlite")
  await createRollout(rolloutPath)
  await createStateDb(dbPath, rolloutPath)

  assert.deepEqual(getCodexThreadRecord("session-old", dbPath), {
    id: "session-old",
    rolloutPath,
    source: "exec",
    modelProvider: "old",
    updatedAt: 10,
    updatedAtMs: 10000,
    archived: 0,
  })

  updateThreadForCodexApp("session-old", "current", new Date(123_456), dbPath)
  assert.deepEqual(getCodexThreadRecord("session-old", dbPath), {
    id: "session-old",
    rolloutPath,
    source: "cli",
    modelProvider: "current",
    updatedAt: 123,
    updatedAtMs: 123456,
    archived: 0,
  })
})

test("isCodexAppReadyThread detects ready rollout and sqlite state", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  await createRollout(rolloutPath, {
    originator: "codex_cli_rs",
    source: "cli",
    model_provider: "current",
  })

  assert.equal(await isCodexAppReadyThread({
    id: "session-ready",
    rolloutPath,
    source: "cli",
    modelProvider: "current",
    updatedAt: 20,
    updatedAtMs: 20000,
    archived: 0,
  }), true)
})


test("isCodexAppListedThread detects sessions already present in Codex App list", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  await createRollout(rolloutPath)

  assert.equal(isCodexAppListedThread({
    id: "session-ready",
    rolloutPath,
    source: "cli",
    modelProvider: "current",
    updatedAt: 20,
    updatedAtMs: 20000,
    archived: 0,
  }), true)
  assert.equal(isCodexAppListedThread({
    id: "session-vscode",
    rolloutPath,
    source: "vscode",
    modelProvider: "current",
    updatedAt: 20,
    updatedAtMs: 20000,
    archived: 0,
  }), true)
  assert.equal(isCodexAppListedThread({
    id: "session-exec",
    rolloutPath,
    source: "exec",
    modelProvider: "current",
    updatedAt: 20,
    updatedAtMs: 20000,
    archived: 0,
  }), false)
  assert.equal(isCodexAppListedThread({
    id: "session-archived",
    rolloutPath,
    source: "cli",
    modelProvider: "current",
    updatedAt: 20,
    updatedAtMs: 20000,
    archived: 1,
  }), false)
})

test("prepareCodexAppSession fails when Codex App is missing", async () => {
  await assert.rejects(
    prepareCodexAppSession(codexSession(), {
      platform: "darwin",
      codexAppPath: "/missing/Codex.app",
      runCommand: () => ({ status: 1 }),
    }),
    /未检测到 Codex App/,
  )
})

test("prepareCodexAppSession returns cancelled when migration needs running app to quit", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  const dbPath = path.join(dir, "state.sqlite")
  const configPath = path.join(dir, "config.toml")
  await createRollout(rolloutPath)
  await createStateDb(dbPath, rolloutPath)
  await fs.writeFile(configPath, "model_provider = \"current\"\n", "utf8")

  let confirmMessage = ""
  let confirmLabel = ""
  const result = await prepareCodexAppSession(codexSession(), {
    platform: "darwin",
    dbPath,
    configPath,
    codexAppPath: dir,
    runCommand: (command, args, input) => {
      if (command === "pgrep") return { status: 0 }
      if (command === "sqlite3") {
        const sqlite = spawnSync("sqlite3", args, {
          encoding: "utf8",
          input,
          stdio: ["pipe", "pipe", "pipe"],
        })
        return { status: sqlite.status, stdout: sqlite.stdout, stderr: sqlite.stderr }
      }
      return { status: 0 }
    },
    confirmQuit: async (message, options) => {
      confirmMessage = message
      confirmLabel = options?.confirmLabel ?? ""
      return false
    },
  })

  assert.match(confirmMessage, /为避免 Codex App 回写覆盖，请先关闭 Codex App。/)
  assert.match(confirmMessage, /To avoid Codex App overwriting local changes,/)
  assert.match(confirmMessage, /please close Codex App first\./)
  assert.equal(confirmLabel, "关闭 Codex App 并继续 / Close Codex App and continue")
  assert.deepEqual(result, { migrated: false, cancelled: true, modelProvider: "current", listed: false })
  assert.equal(getCodexThreadRecord("session-old", dbPath)?.source, "exec")
})

test("prepareCodexAppSession quits running app when confirmed and migrates", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  const dbPath = path.join(dir, "state.sqlite")
  const configPath = path.join(dir, "config.toml")
  const calls: string[] = []
  let running = true
  await createRollout(rolloutPath)
  await createStateDb(dbPath, rolloutPath)
  await fs.writeFile(configPath, "model_provider = \"current\"\n", "utf8")

  const result = await prepareCodexAppSession(codexSession(), {
    platform: "darwin",
    dbPath,
    configPath,
    codexAppPath: dir,
    now: new Date(123_456),
    sleep: async () => {},
    runCommand: (command, args, input) => {
      calls.push(`${command} ${args.join(" ")}`)
      if (command === "pgrep") {
        return { status: running ? 0 : 1 }
      }
      if (command === "osascript") {
        running = false
        return { status: 0 }
      }
      if (command === "sqlite3") {
        const sqlite = spawnSync("sqlite3", args, {
          encoding: "utf8",
          input,
          stdio: ["pipe", "pipe", "pipe"],
        })
        return { status: sqlite.status, stdout: sqlite.stdout, stderr: sqlite.stderr }
      }
      return { status: 0 }
    },
    confirmQuit: async () => true,
  })

  assert.deepEqual(result, { migrated: true, cancelled: false, modelProvider: "current", listed: false })
  assert.equal(calls.some((call) => call.startsWith("osascript ")), true)
  assert.equal(getCodexThreadRecord("session-old", dbPath)?.source, "cli")
  assert.equal(getCodexThreadRecord("session-old", dbPath)?.modelProvider, "current")
  const firstLine = (await fs.readFile(rolloutPath, "utf8")).split("\n")[0]
  assert.equal(JSON.parse(firstLine).payload.originator, "codex_cli_rs")
})

test("prepareCodexAppSession does not quit app or write when session is ready", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  const dbPath = path.join(dir, "state.sqlite")
  const configPath = path.join(dir, "config.toml")
  let quitCalled = false
  await createRollout(rolloutPath, {
    originator: "codex_cli_rs",
    source: "cli",
    model_provider: "current",
  })
  await createStateDb(dbPath, rolloutPath)
  await fs.writeFile(configPath, "model_provider = \"other-current-provider\"\n", "utf8")

  const result = await prepareCodexAppSession(codexSession("session-ready"), {
    platform: "darwin",
    dbPath,
    configPath,
    codexAppPath: dir,
    runCommand: (command, args, input) => {
      if (command === "osascript") quitCalled = true
      if (command === "pgrep") return { status: 0 }
      if (command === "sqlite3") {
        const sqlite = spawnSync("sqlite3", args, {
          encoding: "utf8",
          input,
          stdio: ["pipe", "pipe", "pipe"],
        })
        return { status: sqlite.status, stdout: sqlite.stdout, stderr: sqlite.stderr }
      }
      return { status: 0 }
    },
    confirmQuit: async () => {
      throw new Error("should not confirm")
    },
  })

  assert.deepEqual(result, { migrated: false, cancelled: false, modelProvider: "current", listed: true })
  assert.equal(quitCalled, false)
})


test("prepareCodexAppSession opens listed session without quit confirmation", async () => {
  const dir = await makeTempDir()
  const rolloutPath = path.join(dir, "rollout.jsonl")
  const dbPath = path.join(dir, "state.sqlite")
  const configPath = path.join(dir, "config.toml")
  let quitCalled = false
  await createRollout(rolloutPath)
  await createStateDb(dbPath, rolloutPath)
  await fs.writeFile(configPath, "model_provider = \"current\"\n", "utf8")

  const result = await prepareCodexAppSession(codexSession("session-ready"), {
    platform: "darwin",
    dbPath,
    configPath,
    codexAppPath: dir,
    runCommand: (command, args, input) => {
      if (command === "osascript") quitCalled = true
      if (command === "pgrep") return { status: 0 }
      if (command === "sqlite3") {
        const sqlite = spawnSync("sqlite3", args, {
          encoding: "utf8",
          input,
          stdio: ["pipe", "pipe", "pipe"],
        })
        return { status: sqlite.status, stdout: sqlite.stdout, stderr: sqlite.stderr }
      }
      return { status: 0 }
    },
    confirmQuit: async () => {
      throw new Error("should not confirm")
    },
  })

  assert.deepEqual(result, { migrated: false, cancelled: false, modelProvider: "current", listed: true })
  assert.equal(quitCalled, false)
})

test("openCodexAppSession opens app, waits 3000ms, then opens deeplink", async () => {
  const calls: string[] = []
  const waits: number[] = []
  await openCodexAppSession("session-1", {
    platform: "darwin",
    runCommand: (command, args) => {
      calls.push(`${command} ${args.join(" ")}`)
      return { status: 0 }
    },
    sleep: async (ms) => {
      waits.push(ms)
    },
  })

  assert.deepEqual(calls, [
    "open -a Codex",
    "open codex://threads/session-1",
  ])
  assert.deepEqual(waits, [3000])
})

test("openCodexAppSession opens running listed session deeplink without app launch delay", async () => {
  const calls: string[] = []
  const waits: number[] = []
  await openCodexAppSession("session-1", {
    platform: "darwin",
    skipAppLaunch: true,
    runCommand: (command, args) => {
      calls.push(`${command} ${args.join(" ")}`)
      return { status: 0 }
    },
    sleep: async (ms) => {
      waits.push(ms)
    },
  })

  assert.deepEqual(calls, ["open codex://threads/session-1"])
  assert.deepEqual(waits, [])
})
