faden(thread): 一个支持 Windows/macOS/Linux 的本地会话管理 CLI，当前支持 `codex` 和 `claude`。

## 当前能力

### add

```bash
faden add [-a codex|claude] [-p path] [-n name] [-- <agent args...>]
```

- 未传 `-a` 时，会弹出选择器让你选择 `codex` 或 `claude`
- `-p/--path` 支持相对路径和绝对路径，默认当前工作目录
- `-n/--name` 是 faden 本地别名，不会改上游原生会话标题
- `--` 后面的参数会原样透传给目标 CLI

示例：

```bash
faden add -a codex -p . -n 修复导入 -- --sandbox read-only --ask-for-approval on-request
faden add -a claude -n 继续实现 -- --permission-mode plan
```

实现说明：

- `claude` 在带 `-n` 时会预生成 `--session-id`，会话真正落盘后再绑定别名
- `codex` 在退出后通过同目录前后会话差集识别新会话；只有唯一新会话时才绑定别名

### resume

```bash
faden resume [-a] [-k key] [-p path] [-- <agent args...>]
```

- 默认只列出当前工作目录下的会话
- `-a/--all` 列出所有目录的会话
- `-p/--path` 指定目录过滤
- `-k/--key` 按 `别名 + 原生标题 + sessionId + cwd` 做模糊搜索
- 交互支持上下键切换，`Enter` 恢复，`q` 或 `Ctrl+C` 取消

恢复策略：

- `codex` 执行 `codex resume <sessionId>`
- `claude` 执行 `claude --resume <sessionId>`
- 会自动切换到对应会话的工作目录后再启动

### remove

```bash
faden remove [-a] [-k key] [-p path]
```

- 列表与 `resume` 逻辑一致
- 选中会话后会二次确认
- 当前实现为硬删除，删除成功后会退出 faden

删除策略：

- `codex`：删除对应 `rollout-*.jsonl`，并从 `session_index.jsonl` 中移除
- `claude`：删除对应 `<sessionId>.jsonl`，并从 `sessions-index.json` 中移除
- 删除过程采用“先重命名会话文件，再重写索引，失败回滚”的两阶段方式

## 本地元数据

faden 只保存自己的少量元数据，不复制上游完整会话：

- macOS: `~/Library/Application Support/faden/state.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/faden/state.json`
- Windows: `%AppData%/faden/state.json`

当前只保存会话别名。

另外，`resume` / `remove` 会维护一份本地 `session-cache.json`，缓存会话列表渲染所需的关键信息；只有当会话文件或对应索引文件的 `mtime/size` 变化时，才会重新解析原始 JSONL。

## 开发

```bash
npm install
npm run build
npm test
```

产物入口：`dist/cli.js`
