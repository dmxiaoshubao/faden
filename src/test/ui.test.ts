import test from "node:test"
import assert from "node:assert/strict"

import {
  buildSelectorLines,
  formatSelectorInstructions,
  formatSelectorStatus,
  getVisibleWindowRange,
} from "../ui"

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

test("getVisibleWindowRange shows at most 7 items and keeps selection centered when possible", () => {
  assert.deepEqual(getVisibleWindowRange(5, 20, 7), {
    start: 2,
    end: 9,
  })
  assert.deepEqual(getVisibleWindowRange(10, 20, 7), {
    start: 7,
    end: 14,
  })
})

test("getVisibleWindowRange sticks to the top and bottom near boundaries", () => {
  assert.deepEqual(getVisibleWindowRange(0, 20, 7), {
    start: 0,
    end: 7,
  })
  assert.deepEqual(getVisibleWindowRange(1, 20, 7), {
    start: 0,
    end: 7,
  })
  assert.deepEqual(getVisibleWindowRange(19, 20, 7), {
    start: 13,
    end: 20,
  })
  assert.deepEqual(getVisibleWindowRange(18, 20, 7), {
    start: 13,
    end: 20,
  })
})

test("getVisibleWindowRange returns full range when total does not exceed page size", () => {
  assert.deepEqual(getVisibleWindowRange(2, 7, 7), {
    start: 0,
    end: 7,
  })
  assert.deepEqual(getVisibleWindowRange(0, 3, 7), {
    start: 0,
    end: 3,
  })
})

test("buildSelectorLines renders a 7-item centered window with footer status", () => {
  const lines = buildSelectorLines({
    title: "选择测试会话",
    items: Array.from({ length: 10 }, (_, index) => `item-${String(index + 1).padStart(2, "0")}`),
    renderItem: (item) => item,
  }, 5, 120)

  const output = stripAnsi(lines.join("\n"))

  assert.match(output, /item-03/)
  assert.match(output, /item-09/)
  assert.doesNotMatch(output, /item-01/)
  assert.doesNotMatch(output, /item-02/)
  assert.doesNotMatch(output, /item-10/)
  assert.match(output, /显示 3-9 \/ 10 项/)
})
