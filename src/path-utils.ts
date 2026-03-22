import os from "node:os"
import path from "node:path"

export function normalizePathForMatching(inputPath: string): string {
  let normalized = inputPath.trim().replace(/\\/g, "/")

  if (process.platform === "win32") {
    if (normalized.startsWith("//?/")) {
      normalized = normalized.slice(4)
    }
    normalized = normalized.toLowerCase()
  }

  while (normalized.endsWith("/") && normalized !== "/") {
    if (/^[a-z]:\/$/i.test(normalized)) {
      break
    }
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

export function pathsMatch(left: string, right: string): boolean {
  return normalizePathForMatching(left) === normalizePathForMatching(right)
}

export function expandHome(inputPath: string): string {
  if (!inputPath.startsWith("~")) {
    return inputPath
  }

  return path.join(os.homedir(), inputPath.slice(1))
}

export function resolveInputPath(inputPath: string, cwd = process.cwd()): string {
  const expanded = expandHome(inputPath)
  return path.resolve(cwd, expanded)
}
