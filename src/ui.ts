import readline from "node:readline"

interface SelectOptions<T> {
  title: string
  items: T[]
  renderItem: (item: T, index: number, selected: boolean) => string
  emptyMessage?: string
}

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H")
}

function hideCursor(): void {
  process.stdout.write("\x1b[?25l")
}

function showCursor(): void {
  process.stdout.write("\x1b[?25h")
}

function ensureInteractiveTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("当前终端不是交互式 TTY，无法打开选择器。")
  }
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
    const maxVisible = 12

    const render = () => {
      clearScreen()
      console.log(options.title)
      console.log("使用上下键切换，Enter 确认，q 或 Ctrl+C 取消。\n")

      const start = Math.max(0, selectedIndex - maxVisible + 1)
      const end = Math.min(options.items.length, start + maxVisible)
      for (let index = start; index < end; index += 1) {
        console.log(options.renderItem(options.items[index], index, index === selectedIndex))
      }

      if (options.items.length > maxVisible) {
        console.log(
          `\n显示 ${start + 1}-${end} / ${options.items.length} 项`,
        )
      }
    }

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.off("keypress", onKeyPress)
      process.stdin.pause()
      showCursor()
      clearScreen()
    }

    const finish = (value: T | null) => {
      cleanup()
      resolve(value)
    }

    const onKeyPress = (_input: string, key: readline.Key) => {
      if (key.name === "up") {
        selectedIndex =
          (selectedIndex - 1 + options.items.length) % options.items.length
        render()
        return
      }

      if (key.name === "down") {
        selectedIndex = (selectedIndex + 1) % options.items.length
        render()
        return
      }

      if (key.name === "return") {
        finish(options.items[selectedIndex])
        return
      }

      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        finish(null)
      }
    }

    readline.emitKeypressEvents(process.stdin)
    process.stdin.resume()
    process.stdin.setRawMode(true)
    hideCursor()
    render()
    process.stdin.on("keypress", onKeyPress)
  })
}

export async function confirmAction(message: string): Promise<boolean> {
  const result = await selectItem({
    title: message,
    items: [true, false],
    renderItem: (item, _index, selected) => {
      const label = item ? "确认删除" : "取消"
      return `${selected ? ">" : " "} ${label}`
    },
  })

  return result === true
}
