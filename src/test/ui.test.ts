import test from "node:test"
import assert from "node:assert/strict"

import { formatSelectorInstructions, formatSelectorStatus } from "../ui"

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "")
}

test("formatSelectorInstructions includes bilingual copy and highlighted keys", () => {
  const lines = formatSelectorInstructions()
  assert.equal(lines.length, 2)
  assert.ok(stripAnsi(lines[0]).includes("使用 上下键 切换，Enter 确认，Esc / q / Ctrl+C 取消。"))
  assert.ok(stripAnsi(lines[1]).includes("Use Up/Down to navigate, Enter to confirm, Esc / q / Ctrl+C to cancel."))
  assert.match(lines[0], /\x1b\[1;38;2;191;219;254mEnter\x1b\[0m/)
})

test("formatSelectorStatus highlights range and total in bilingual footer", () => {
  const output = formatSelectorStatus(1, 12, 188)
  assert.match(stripAnsi(output), /显示 .*1-12.*188.* 项 · Showing .*1-12.*188/)
  assert.match(output, /\x1b\[1;38;2;191;219;254m1-12\x1b\[0m/)
  assert.match(output, /\x1b\[1;38;2;191;219;254m188\x1b\[0m/)
})
