# faden

`faden` is a local session management CLI for `codex` and `claude`. It helps you create, resume, remove, and label sessions from a single command-line entry point on Windows, macOS, and Linux.

## Use Cases

- You want to switch `codex` keys, accounts, or runtime environments without losing the ability to return to the same session context
- You want to filter sessions by project directory instead of browsing raw session files
- You want to add, update, or clear a short local alias for a session
- You want support for both `codex` and `claude` sessions

## Features

- Create `codex` or `claude` sessions
- Filter sessions by current directory, explicit path, or all paths
- Search by alias, native title, session ID, or working directory
- Resume a session and switch back to the original working directory automatically
- Remove a session and update upstream index files safely
- Set, update, or clear local aliases for existing sessions
- Cache parsed session summaries to avoid repeated full JSONL scans

## Installation

### Requirements

- Node.js `>= 18`
- `codex` installed and available in `PATH`
- `claude` installed and available in `PATH` if you want Claude session support

### Install from npm

```bash
npm install -g @dmxiaoshubao/faden
```

Then run:

```bash
faden --help
```

### Run from source

```bash
npm install
npm run build
node dist/cli.js --help
```

## Commands

### Create a session

```bash
faden add [codex|claude] [-p path] [-n name] [-- <agent args...>]
```

- If no agent is provided, `faden` opens an interactive selector
- `-p` / `--path` sets the working directory, defaulting to the current directory
- `-n` / `--name` binds a local alias without changing the upstream session title
- Arguments after `--` are passed through to the underlying CLI

Examples:

```bash
faden add codex -p . -n fix-imports -- --sandbox read-only --ask-for-approval on-request
faden add claude -n continue-impl -- --permission-mode plan
```

Alias binding details:

- For `claude`, `faden` pre-generates a `--session-id` when `-n` is used, then binds the alias after the session is persisted
- For `codex`, `faden` compares sessions before and after the command exits and only binds the alias when exactly one new session is detected

### Resume a session

```bash
faden resume [codex|claude] [-a] [-k key] [-p path] [-- <agent args...>]
```

- By default, only sessions under the current working directory are shown
- `-a` / `--all` lists sessions across all directories
- `-p` / `--path` limits results to a specific directory
- `-k` / `--key` filters by alias, title, session ID, or directory
- Interactive controls: arrow keys to move, `Enter` to resume, `q` or `Ctrl+C` to cancel

Resume behavior:

- `codex` uses `codex resume <sessionId>`
- `claude` uses `claude --resume <sessionId>`
- The command runs inside the session's original working directory

### Remove a session

```bash
faden remove [codex|claude] [-a] [-k key] [-p path]
```

- Uses the same filtering rules as `resume`
- Asks for confirmation before deletion
- Deletion is permanent

Removal behavior:

- `codex`: removes the matching `rollout-*.jsonl` file and updates `session_index.jsonl`
- `claude`: removes the matching `<sessionId>.jsonl` file and updates `sessions-index.json`
- The removal flow uses a two-phase approach: rename first, rewrite index second, and roll back on failure

### Manage local aliases

```bash
faden alias set [codex|claude] [-a] [-k key] [-p path] <name>
faden alias clear [codex|claude] [-a] [-k key] [-p path]
```

- `alias set` adds or updates a local alias for an existing session
- `alias clear` removes the local alias from a session
- The session filtering flow is the same as `resume` and `remove`
- This only changes `faden` local metadata and does not modify upstream session titles

## Local Metadata

`faden` stores only a small amount of local metadata and does not duplicate full upstream sessions.

### Session source paths

| Source | macOS | Linux | Windows | Environment override | Files read by `faden` | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | `~/.codex` | `~/.codex` | `%USERPROFILE%\\.codex` | `CODEX_HOME` | `sessions/**/rollout-*.jsonl` | Reads session body, `sessionId`, `cwd`, timestamps, message counts, git branch, and related metadata |
| Codex | `~/.codex` | `~/.codex` | `%USERPROFILE%\\.codex` | `CODEX_HOME` | `session_index.jsonl` | Reads indexed title and index timestamps for list rendering |
| Claude | `~/.claude/projects` | `~/.claude/projects` | `%USERPROFILE%\\.claude\\projects` | `CLAUDE_CONFIG_DIR` | `projects/*/*.jsonl` | Reads session body, `sessionId`, `cwd`, timestamps, message counts, git branch, and related metadata |
| Claude | `~/.claude/projects` | `~/.claude/projects` | `%USERPROFILE%\\.claude\\projects` | `CLAUDE_CONFIG_DIR` | `projects/*/sessions-index.json` | Reads indexed summary, first prompt, modified time, message count, project path, and related metadata |

Notes:

- When `CODEX_HOME` is set, the Codex root directory becomes `${CODEX_HOME}`
- When `CLAUDE_CONFIG_DIR` is set, the Claude root directory becomes `${CLAUDE_CONFIG_DIR}`
- `faden` combines raw session files with index files to build the final session list
- These are the current default upstream storage locations used by `codex` and `claude`; `faden` only reads from them

Alias metadata locations:

- macOS: `~/Library/Application Support/faden/state.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/faden/state.json`
- Windows: `%AppData%/faden/state.json`

`resume` and `remove` also maintain a local `session-cache.json` file with the minimal data needed to render the session list. Raw JSONL files are reparsed only when the source files or index files change in `mtime` or `size`.

## License

MIT. See `LICENSE`.
