import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type Preferences
} from '@shared/preferences'

let cached: Preferences | null = null
let loading: Promise<Preferences> | null = null
let writeChain: Promise<void> = Promise.resolve()

function preferencesFile(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

async function readPreferences(): Promise<Preferences> {
  try {
    const raw = JSON.parse(
      await fs.readFile(preferencesFile(), 'utf8')
    ) as unknown
    return normalizePreferences(raw)
  } catch {
    return normalizePreferences(DEFAULT_PREFERENCES)
  }
}

export async function getPreferences(): Promise<Preferences> {
  if (cached) return cached
  if (!loading) {
    loading = readPreferences()
      .then((value) => {
        cached = value
        return value
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}

async function writePreferences(value: Preferences): Promise<void> {
  const target = preferencesFile()
  const temp = `${target}.tmp`

  writeChain = writeChain.then(
    async () => {
      await fs.mkdir(dirname(target), { recursive: true })
      await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await fs.rename(temp, target)
    },
    async () => {
      await fs.mkdir(dirname(target), { recursive: true })
      await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await fs.rename(temp, target)
    }
  )

  await writeChain
}

export async function savePreferences(input: unknown): Promise<Preferences> {
  const next = normalizePreferences(input)
  cached = next
  await writePreferences(next)
  return next
}

export async function resetPreferences(): Promise<Preferences> {
  return savePreferences(DEFAULT_PREFERENCES)
}
