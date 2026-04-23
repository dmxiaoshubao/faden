interface SelectOptions<T> {
  title: string
  items: T[]
  renderItem: (item: T, index: number, selected: boolean) => string | string[]
  emptyMessage?: string
}

const ANSI_RESET = "\x1b[0m"
const UI_KEYWORD_COLOR = "\x1b[1;38;2;191;219;254m"

function highlightUiKeyword(input: string): string {
  return `${UI_KEYWORD_COLOR}${input}${ANSI_RESET}`
}

export function formatSelectorInstructions(): string[] {
  return [
    `使用 ${highlightUiKeyword("上下键")} 切换，${highlightUiKeyword("Enter")} 确认，${highlightUiKeyword("Esc")} / ${highlightUiKeyword("q")} / ${highlightUiKeyword("Ctrl+C")} 取消。`,
    `Use ${highlightUiKeyword("Up/Down")} to navigate, ${highlightUiKeyword("Enter")} to confirm, ${highlightUiKeyword("Esc")} / ${highlightUiKeyword("q")} / ${highlightUiKeyword("Ctrl+C")} to cancel.`,
  ]
}

export function formatSelectorStatus(start: number, end: number, total: number): string {
  const range = `${start}-${end}`
  return `显示 ${highlightUiKeyword(range)} / ${highlightUiKeyword(String(total))} 项 · Showing ${highlightUiKeyword(range)} of ${highlightUiKeyword(String(total))}`
}

export function getVisibleWindowRange(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number,
): { start: number; end: number } {
  if (totalItems <= 0 || maxVisible <= 0) {
    return { start: 0, end: 0 }
  }

  if (totalItems <= maxVisible) {
    return { start: 0, end: totalItems }
  }

  const halfWindow = Math.floor(maxVisible / 2)
  const maxStart = totalItems - maxVisible
  const start = Math.min(
    Math.max(0, selectedIndex - halfWindow),
    maxStart,
  )

  return {
    start,
    end: Math.min(totalItems, start + maxVisible),
  }
}

function hideCursor(): void {
  process.stdout.write("\x1b[?25l")
}

function showCursor(): void {
  process.stdout.write("\x1b[?25h")
}

function enterAlternateScreen(): void {
  process.stdout.write("\x1b[?1049h")
}

function leaveAlternateScreen(): void {
  process.stdout.write("\x1b[?1049l")
}

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H")
}

function charDisplayWidth(char: string): number {
  return char.charCodeAt(0) > 0xff ? 2 : 1
}

function readAnsiSequence(input: string, startIndex: number): { value: string; nextIndex: number } | null {
  if (input[startIndex] !== "\x1b" || input[startIndex + 1] !== "[") {
    return null
  }

  let index = startIndex + 2
  while (index < input.length) {
    const code = input.charCodeAt(index)
    if (code >= 0x40 && code <= 0x7e) {
      return {
        value: input.slice(startIndex, index + 1),
        nextIndex: index + 1,
      }
    }
    index += 1
  }

  return {
    value: input.slice(startIndex),
    nextIndex: input.length,
  }
}

function truncateLine(input: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return ""
  }

  const segments: Array<{ value: string; width: number }> = []
  let width = 0
  let truncated = false
  let index = 0
  while (index < input.length) {
    const ansiSequence = readAnsiSequence(input, index)
    if (ansiSequence) {
      segments.push({ value: ansiSequence.value, width: 0 })
      index = ansiSequence.nextIndex
      continue
    }

    const char = input[index]
    const charWidth = charDisplayWidth(char)
    const nextWidth = width + charWidth
    if (nextWidth > maxWidth) {
      truncated = true
      break
    }
    segments.push({ value: char, width: charWidth })
    width = nextWidth
    index += 1
  }

  if (!truncated && index >= input.length) {
    return segments.map((segment) => segment.value).join("")
  }

  if (maxWidth === 1) {
    return "…"
  }

  while (width + 1 > maxWidth && segments.length > 0) {
    const removed = segments.pop()
    if (removed && removed.width > 0) {
      width -= removed.width
    }
  }

  let output = segments.map((segment) => segment.value).join("")
  if (output.includes("\x1b[") && !output.endsWith("\x1b[0m")) {
    output += "\x1b[0m"
  }

  return `${output}…`
}

function ensureInteractiveTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("当前终端不是交互式 TTY，无法打开选择器。")
  }
}

function normalizeRenderedItem(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input]
}

export async function selectItem<T>(
  options: SelectOptions<T>,
): Promise<T | null> {
  ensureInteractiveTerminal()

  if (options.items.length === 0) {
    if (options.emptyMessage) {
      console.log(options.emptyMessage)
      return null
    }
    throw new Error("没有可选项。")
  }

  return new Promise<T | null>((resolve) => {
    let selectedIndex = 0
    const maxVisible = 7

    const render = () => {
      const maxWidth = Math.max(1, (process.stdout.columns ?? 80) - 1)
      const lines = [
        options.title,
        ...formatSelectorInstructions(),
        "",
      ]

      const { start, end } = getVisibleWindowRange(
        selectedIndex,
        options.items.length,
        maxVisible,
      )
      for (let index = start; index < end; index += 1) {
        lines.push(...normalizeRenderedItem(
          options.renderItem(options.items[index], index, index === selectedIndex),
        ))
        if (index < end - 1) {
          lines.push("")
        }
      }

      if (options.items.length > maxVisible) {
        lines.push("", formatSelectorStatus(start + 1, end, options.items.length))
      }

      clearScreen()
      process.stdout.write(lines.map((line) => truncateLine(line, maxWidth)).join("\n"))
    }

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.off("data", onData)
      process.stdin.pause()
      showCursor()
      leaveAlternateScreen()
    }

    const finish = (value: T | null) => {
      cleanup()
      resolve(value)
    }

    const onData = (input: Buffer | string) => {
      const key = Buffer.isBuffer(input) ? input.toString("utf8") : input

      if (key === "\u001b[A" || key === "\u001bOA") {
        selectedIndex =
          (selectedIndex - 1 + options.items.length) % options.items.length
        render()
        return
      }

      if (key === "\u001b[B" || key === "\u001bOB") {
        selectedIndex = (selectedIndex + 1) % options.items.length
        render()
        return
      }

      if (key === "\r" || key === "\n") {
        finish(options.items[selectedIndex])
        return
      }

      if (key === "\u001b" || key === "q" || key === "Q" || key === "\u0003") {
        finish(null)
      }
    }

    process.stdin.resume()
    process.stdin.setRawMode(true)
    enterAlternateScreen()
    hideCursor()
    render()
    process.stdin.on("data", onData)
  })
}

export async function confirmAction(message: string): Promise<boolean> {
  const { formatSelectableLabel } = await import("./render")

  const result = await selectItem({
    title: message,
    items: [true, false],
    renderItem: (item, _index, selected) => {
      const label = item
        ? "确认删除 / Confirm delete"
        : "取消 / Cancel"
      return formatSelectableLabel(label, selected)
    },
  })

  return result === true
}
