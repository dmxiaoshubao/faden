import fs from "node:fs/promises"
import path from "node:path"

export async function walkFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath)))
      continue
    }
    if (entry.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const dirPath = path.dirname(filePath)
  await fs.mkdir(dirPath, { recursive: true })
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  await fs.writeFile(tempPath, content, "utf8")
  await fs.rename(tempPath, filePath)
}
