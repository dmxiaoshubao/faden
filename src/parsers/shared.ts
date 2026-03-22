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
