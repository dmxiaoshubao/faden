export interface SelectOptions<T> {
  title: string
  items: T[]
  renderItem: (item: T, index: number, selected: boolean) => string | string[]
  emptyMessage?: string
}

const ANSI_RESET = "\x1b[0m"
const UI_KEYWORD_COLOR = "\x1b[1;38;2;191;219;254m"
const MAX_VISIBLE_ITEMS = 7

type ReactRuntime = {
  createElement: (...args: unknown[]) => unknown
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void
  useState: <T>(initialState: T) => [
    T,
    (value: T | ((currentValue: T) => T)) => void,
  ]
}

type InkRuntime = {
  render: (
    node: unknown,
    options?: {
      stdout?: NodeJS.WriteStream
      stdin?: NodeJS.ReadStream
      stderr?: NodeJS.WriteStream
      exitOnCtrlC?: boolean
      patchConsole?: boolean
      alternateScreen?: boolean
      incrementalRendering?: boolean
    },
  ) => {
    waitUntilExit: () => Promise<unknown>
  }
  Text: unknown
  useApp: () => { exit: (errorOrResult?: Error | unknown) => void }
  useCursor: () => { setCursorPosition: (position: { x: number; y: number } | undefined) => void }
  useInput: (
    inputHandler: (
      input: string,
      key: {
        upArrow: boolean
        downArrow: boolean
        return: boolean
        escape: boolean
        ctrl: boolean
      },
    ) => void,
  ) => void
  useWindowSize: () => { columns: number; rows: number }
}

const loadEsmModule = new Function(
  "specifier",
  "return import(specifier)",
) as <T>(specifier: string) => Promise<T>

let inkRuntimePromise: Promise<{ React: ReactRuntime; ink: InkRuntime }> | undefined

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
  if (output.includes("\x1b[") && !output.endsWith(ANSI_RESET)) {
    output += ANSI_RESET
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

async function loadInkRuntime(): Promise<{ React: ReactRuntime; ink: InkRuntime }> {
  if (!inkRuntimePromise) {
    inkRuntimePromise = Promise.all([
      loadEsmModule<typeof import("react")>("react"),
      loadEsmModule<unknown>("ink"),
    ]).then(([reactModule, inkModule]) => {
      const reactValue = (
        "default" in reactModule && reactModule.default
          ? reactModule.default
          : reactModule
      ) as unknown as ReactRuntime

      return {
        React: reactValue,
        ink: inkModule as unknown as InkRuntime,
      }
    })
  }

  return inkRuntimePromise
}

export function buildSelectorLines<T>(
  options: SelectOptions<T>,
  selectedIndex: number,
  maxWidth: number,
): string[] {
  const lines = [
    options.title,
    ...formatSelectorInstructions(),
    "",
  ]

  const { start, end } = getVisibleWindowRange(
    selectedIndex,
    options.items.length,
    MAX_VISIBLE_ITEMS,
  )

  for (let index = start; index < end; index += 1) {
    lines.push(...normalizeRenderedItem(
      options.renderItem(options.items[index], index, index === selectedIndex),
    ))
    if (index < end - 1) {
      lines.push("")
    }
  }

  if (options.items.length > MAX_VISIBLE_ITEMS) {
    lines.push("", formatSelectorStatus(start + 1, end, options.items.length))
  }

  return lines.map((line) => truncateLine(line, maxWidth))
}

export function buildSelectorCleanupSequence(renderedLineCount: number): string {
  if (renderedLineCount <= 0) {
    return ""
  }

  return `\x1b[${renderedLineCount}A\x1b[J`
}

async function writeStdoutAndWait(output: string): Promise<void> {
  if (!output || !process.stdout.isTTY) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    process.stdout.write(output, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
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

  const { React, ink } = await loadInkRuntime()
  const { createElement, useEffect, useState } = React
  const { Text, render, useApp, useCursor, useInput, useWindowSize } = ink
  let lastRenderedLineCount = 0

  const Selector = () => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const { columns } = useWindowSize()
    const { exit } = useApp()
    const { setCursorPosition } = useCursor()

    useEffect(() => {
      setCursorPosition(undefined)
    }, [setCursorPosition])

    useInput((input, key) => {
      if (key.upArrow) {
        setSelectedIndex((currentIndex) => {
          return (currentIndex - 1 + options.items.length) % options.items.length
        })
        return
      }

      if (key.downArrow) {
        setSelectedIndex((currentIndex) => {
          return (currentIndex + 1) % options.items.length
        })
        return
      }

      if (key.return) {
        exit(options.items[selectedIndex])
        return
      }

      if (key.escape || input === "q" || input === "Q" || input === "\u0003" || (key.ctrl && input.toLowerCase() === "c")) {
        exit(null)
      }
    })

    const lines = buildSelectorLines(
      options,
      selectedIndex,
      Math.max(1, columns - 1),
    )
    lastRenderedLineCount = lines.length

    return createElement(
      Text,
      { wrap: "truncate-end" },
      lines.join("\n"),
    )
  }

  const inkInstance = render(createElement(Selector), {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: false,
    incrementalRendering: true,
  })

  const result = await inkInstance.waitUntilExit()
  const cleanupSequence = buildSelectorCleanupSequence(lastRenderedLineCount)
  await writeStdoutAndWait(cleanupSequence)
  return result == null ? null : result as T
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
