# Changelog

## 0.2.1 - 2026-04-27

- Updated `codex` terminal resume to pass `-C <session.cwd>` automatically, so Codex resumes with the recorded working directory and skips the extra cwd confirmation step.

### 中文版

- 调整 `codex` 的终端恢复参数，默认自动补上 `-C <session.cwd>`，让 Codex 直接沿用会话记录的工作目录，并跳过额外的 cwd 二次确认步骤。

## 0.2.0 - 2026-04-23

- Added built-in IDE presets for `VS Code`, `Cursor`, `Trae`, `Windsurf`, and `Antigravity`, so `resume` can open Codex or Claude sessions in supported VS Code forks.
- Improved selector paging to show at most 7 items at a time and keep the active selection centered when possible.
- Rebuilt the interactive selector with `Ink`, switched the runtime baseline to Node.js 22, and improved terminal rendering behavior for full-screen selection flows.
- Removed `resume` preflight checks before entering the open-mode selector and before launching the terminal CLI, reducing selection-to-action latency.

### 中文版

- 新增内置 IDE 预设：`VS Code`、`Cursor`、`Trae`、`Windsurf`、`Antigravity`，`resume` 现在可以在这些受支持的 VS Code fork 中打开 Codex 或 Claude 会话。
- 优化选择器分页逻辑：单页最多展示 7 条，并在可能的情况下尽量让当前选中项保持在中间位置。
- 使用 `Ink` 重构交互选择器，将运行时基线提升到 Node.js 22，并改进全屏选择流程下的终端渲染体验。
- 移除 `resume` 在进入打开方式选择器前、以及启动终端 CLI 前的预检查，降低从选择到执行之间的等待延迟。
