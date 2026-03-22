import fs from "node:fs"
import readline from "node:readline"

export function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T
  } catch {
    return null
  }
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input
  }
  return `${input.slice(0, maxLength - 3)}...`
}

export function cleanText(input: string): string | null {
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function toIsoDate(input: string | undefined | null): string | null {
  if (!input) {
    return null
  }

  const timestamp = Date.parse(input)
  if (Number.isNaN(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

export async function readFileLines(
  filePath: string,
  onLine: (line: string) => void | Promise<void>,
): Promise<void> {
  const input = fs.createReadStream(filePath, { encoding: "utf8" })
  const reader = readline.createInterface({
    input,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of reader) {
      await onLine(line)
    }
  } finally {
    reader.close()
  }
}
