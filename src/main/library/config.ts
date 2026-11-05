import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_LIBRARY_FOLDERS } from '@shared/library-schema'

interface LibraryConfig {
  version: 1
  root: string
}

let cachedRoot: string | null = null

function configFile(): string {
  return join(app.getPath('userData'), 'library.json')
}

export function defaultLibraryRoot(): string {
  return join(app.getPath('documents'), 'CineLab Assets')
}

async function readConfig(): Promise<LibraryConfig | null> {
  try {
    const raw = JSON.parse(await fs.readFile(configFile(), 'utf8')) as Partial<LibraryConfig>
    if (typeof raw.root === 'string' && raw.root.trim()) {
      return { version: 1, root: raw.root }
    }
  } catch {
    // 配置不存在或损坏，使用默认路径
  }
  return null
}

async function writeConfig(root: string): Promise<void> {
  const file = configFile()
  await fs.mkdir(dirname(file), { recursive: true })

  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ version: 1, root }, null, 2), 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

async function prepareRoot(root: string): Promise<string> {
  const resolved = resolve(root)
  await fs.mkdir(resolved, { recursive: true })

  for (const folder of DEFAULT_LIBRARY_FOLDERS) {
    await fs.mkdir(join(resolved, folder), { recursive: true })
  }

  return resolved
}

export async function ensureLibrary(): Promise<string> {
  if (cachedRoot) return cachedRoot

  const config = await readConfig()
  const root = await prepareRoot(config?.root ?? defaultLibraryRoot())
  if (!config) await writeConfig(root)

  cachedRoot = root
  return root
}

export async function getLibraryRoot(): Promise<string> {
  return ensureLibrary()
}

export async function setLibraryRoot(path: string): Promise<string> {
  const root = await prepareRoot(path)
  await writeConfig(root)
  cachedRoot = root
  return root
}

export async function resetLibraryRoot(): Promise<string> {
  return setLibraryRoot(defaultLibraryRoot())
}
