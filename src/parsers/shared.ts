import fs from "node:fs"
import readline from "node:readline"

const PROJECT_INSTRUCTION_BLOCK_REGEX =
  /# AGENTS\.md instructions for [^\n]+[\s\S]*?<\/INSTRUCTIONS>/g
const ENVIRONMENT_CONTEXT_BLOCK_REGEX =
  /<environment_context>[\s\S]*?<\/environment_context>/g
const IDE_CONTEXT_PREFIX_REGEX =
  /# Context from my IDE setup:\s*[\s\S]*?## My request for [^:\n]+:\s*/g
const IDE_CONTEXT_REQUEST_REGEX =
  /## My request(?: for [^:\n]+)?:\s*([\s\S]*)$/i
const CLAUDE_NOISE_BLOCK_REGEX =
  /<system-reminder>[\s\S]*?<\/system-reminder>|<local-command-caveat>[\s\S]*?<\/local-command-caveat>|<command-name>[\s\S]*?<\/command-name>|<command-message>[\s\S]*?<\/command-message>|<command-args>[\s\S]*?<\/command-args>|<local-command-stdout>[\s\S]*?<\/local-command-stdout>|<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>|<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g

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

export function hasProjectInstructions(input: string): boolean {
  return /# AGENTS\.md instructions for\b/.test(input)
}

export function extractMeaningfulTitle(input: string, maxLength = 100): string | null {
  const trimmed = input.trim()
  if (trimmed.startsWith("# Context from my IDE setup:")) {
    const requestMatch = trimmed.match(IDE_CONTEXT_REQUEST_REGEX)
    if (!requestMatch?.[1]) {
      return null
    }

    return extractMeaningfulTitle(requestMatch[1], maxLength)
  }

  const stripped = input
    .replace(PROJECT_INSTRUCTION_BLOCK_REGEX, " ")
    .replace(ENVIRONMENT_CONTEXT_BLOCK_REGEX, " ")
    .replace(IDE_CONTEXT_PREFIX_REGEX, " ")
    .replace(CLAUDE_NOISE_BLOCK_REGEX, " ")
  const cleaned = cleanText(stripped.replace(/\s+/g, " "))
  if (!cleaned || cleaned === "New Conversation") {
    return null
  }

  return truncate(cleaned, maxLength)
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
