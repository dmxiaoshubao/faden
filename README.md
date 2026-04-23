# faden

`faden` 是一个面向 `codex` 和 `claude` 的本地会话管理命令行工具，支持在 Windows、macOS 和 Linux 上统一完成会话新建、恢复、删除和别名绑定。

英文说明见 `docs/README.en.md`。

## 适用场景

- 切换 `codex` key、账号或运行环境之后，仍希望回到原来的会话上下文继续工作
- 想按项目目录快速找回历史会话，而不是手动翻找原始会话文件
- 希望给会话补设、修改或清除一个更易记的本地别名
- 同时支持 `codex` 和 `claude` 会话

## 功能概览

- 支持新建 `codex` / `claude` 会话
- 支持按当前目录、指定目录或全部目录筛选会话
- 支持按别名、原生标题、会话 ID 和工作目录做模糊搜索
- 支持恢复会话并自动切换到原工作目录
- 支持删除会话并同步维护上游索引文件
- 支持为已有会话补设、修改或清除本地别名
- 支持本地缓存会话摘要，降低重复解析 JSONL 的开销

## 安装

### 前置条件

- Node.js `>= 18`
- 已安装并可直接调用 `codex`
- 如果要管理 Claude 会话，还需要已安装并可直接调用 `claude`

### 使用 npm 安装

```bash
npm install -g @dmxiaoshubao/faden
```

安装完成后可直接运行：

```bash
faden --help
```

### 从源码运行

```bash
npm install
npm run build
node dist/cli.js --help
```

## 命令说明

### 新建会话

```bash
faden add [codex|claude] [-p path] [-n name] [-- <agent args...>]
```

- 不传 `codex|claude` 时，会弹出交互选择器
- `-p` / `--path` 用于指定工作目录，默认当前目录
- `-n` / `--name` 用于给会话绑定本地别名，不会修改上游原生标题
- `--` 之后的参数会原样透传给底层 CLI

示例：

```bash
faden add codex -p . -n 修复导入 -- --sandbox read-only --ask-for-approval on-request
faden add claude -n 继续实现 -- --permission-mode plan
```

别名绑定策略：

- `claude` 在带 `-n` 时会预生成 `--session-id`，待会话真正落盘后再绑定别名
- `codex` 会在退出后比较同目录前后的会话差集，只有唯一识别到新会话时才绑定别名

### 恢复会话

```bash
faden resume [codex|claude] [-a] [-k key] [-p path] [-- <agent args...>]
```

- 默认仅列出当前工作目录下的会话
- `-a` / `--all` 用于列出所有目录的会话
- `-p` / `--path` 用于只查看指定目录下的会话
- `-k` / `--key` 用于按别名、标题、会话 ID 或目录做模糊过滤
- 交互操作支持上下方向键选择，按 `Enter` 确认，按 `q` 或 `Ctrl+C` 取消
- 选中会话后会再次选择打开方式，默认是终端恢复
- 当前支持的 IDE 预设：`VS Code`、`Cursor`、`Trae`、`Windsurf`、`Antigravity`

恢复方式：

- `终端恢复（默认）`
- `codex` 使用 `codex resume <sessionId>`
- `claude` 使用 `claude --resume <sessionId>`
- 终端恢复前会先切换到会话原始工作目录
- `IDE 插件打开`
- `codex` 会先用所选 IDE 打开会话原始项目，再通过 `${scheme}://openai.chatgpt/local/<sessionId>` 进入对应会话
- `claude` 会先用所选 IDE 打开会话原始项目，再通过 `${scheme}://anthropic.claude-code/open?session=<sessionId>` 在插件标签页中打开对应会话
- 当前内置 URI scheme：
  - `VS Code` -> `vscode://`
  - `Cursor` -> `cursor://`
  - `Trae` -> `trae://`
  - `Windsurf` -> `windsurf://`
  - `Antigravity` -> `antigravity://`
- IDE 打开依赖对应 shell 命令和对应官方插件都已安装
- `-- <agent args...>` 仅在“终端恢复”模式下生效，IDE 插件打开不支持透传参数

### 删除会话

```bash
faden remove [codex|claude] [-a] [-k key] [-p path]
```

- 列表筛选逻辑与 `resume` 一致
- 删除前会进行二次确认
- 当前实现为硬删除，删除后不可恢复

删除方式：

- `codex` 会删除对应 `rollout-*.jsonl`，并从 `session_index.jsonl` 移除索引项
- `claude` 会删除对应 `<sessionId>.jsonl`，并从 `sessions-index.json` 移除索引项
- 删除过程采用“两阶段”处理，先重命名会话文件，再重写索引；若失败则回滚

### 管理本地别名

```bash
faden alias set [codex|claude] [-a] [-k key] [-p path] <name>
faden alias clear [codex|claude] [-a] [-k key] [-p path]
```

- `alias set` 用于为已有会话补设或更新本地别名
- `alias clear` 用于清除已有本地别名
- 会话筛选逻辑与 `resume` / `remove` 一致
- 这里修改的是 `faden` 本地维护的 alias，不会修改上游原生会话标题

## 本地数据说明

`faden` 只维护自己的少量元数据，不复制上游完整会话内容。

### 历史会话来源路径

| 来源 | macOS | Linux | Windows | 可覆盖环境变量 | 实际读取的文件 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | `~/.codex` | `~/.codex` | `%USERPROFILE%\\.codex` | `CODEX_HOME` | `sessions/**/rollout-*.jsonl` | 读取会话正文、`sessionId`、`cwd`、时间、消息数、分支等信息 |
| Codex | `~/.codex` | `~/.codex` | `%USERPROFILE%\\.codex` | `CODEX_HOME` | `session_index.jsonl` | 读取索引标题和索引时间，用于补全会话列表展示 |
| Claude | `~/.claude/projects` | `~/.claude/projects` | `%USERPROFILE%\\.claude\\projects` | `CLAUDE_CONFIG_DIR` | `projects/*/*.jsonl` | 读取会话正文、`sessionId`、`cwd`、时间、消息数、分支等信息 |
| Claude | `~/.claude/projects` | `~/.claude/projects` | `%USERPROFILE%\\.claude\\projects` | `CLAUDE_CONFIG_DIR` | `projects/*/sessions-index.json` | 读取索引摘要、首条提示、修改时间、消息数、项目路径等信息 |

说明：

- 当设置 `CODEX_HOME` 时，Codex 的读取根目录会变成 `${CODEX_HOME}`
- 当设置 `CLAUDE_CONFIG_DIR` 时，Claude 的读取根目录会变成 `${CLAUDE_CONFIG_DIR}`
- `faden` 会同时结合原始会话文件和索引文件来生成最终的会话列表
- 上面这几项是 `codex` / `claude` 当前默认使用的历史目录，`faden` 只是按这些位置读取

别名元数据位置：

- macOS: `~/Library/Application Support/faden/state.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/faden/state.json`
- Windows: `%AppData%/faden/state.json`

另外，`resume` 和 `remove` 会维护一份本地 `session-cache.json`，只缓存会话列表展示所需的关键信息。只有当会话文件或对应索引文件的 `mtime` 或 `size` 变化时，才会重新解析原始 JSONL。

## 许可证

本项目使用 MIT 协议，详见 `LICENSE`。
