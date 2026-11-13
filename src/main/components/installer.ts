import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ComponentKind, ComponentManifest } from '@shared/components'
import { extractZipSafely } from './zip-extract'

export const MODEL_FILES: Partial<Record<ComponentKind, string>> = {
  'depth-model': 'video_depth_anything_vits.pth',
  'whisper-model': 'ggml-base.bin'
}

export async function installComponentFiles(
  kind: ComponentKind,
  downloadPath: string,
  targetDir: string,
  manifest: ComponentManifest
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  const modelFile = MODEL_FILES[kind]
  if (modelFile) {
    const destination = join(targetDir, modelFile)
    await fs.rm(destination, { force: true })
    await fs.rename(downloadPath, destination)
    await writeManifest(targetDir, manifest)
    return
  }

  const staging = `${targetDir}.staging`
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(staging, { recursive: true })

  try {
    await extractZipSafely(downloadPath, staging, {
      maxFiles: manifest.files > 0 ? manifest.files + 32 : undefined,
      maxTotalBytes:
        manifest.expandedSize > 0
          ? manifest.expandedSize + 64 * 1024 * 1024
          : undefined
    })
    await writeManifest(staging, manifest)
    await swapDirectory(staging, targetDir)
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function swapDirectory(staging: string, targetDir: string): Promise<void> {
  const backup = `${targetDir}.old`
  await fs.rm(backup, { recursive: true, force: true })

  let hasBackup = false
  try {
    await fs.rename(targetDir, backup)
    hasBackup = true
  } catch {
    hasBackup = false
  }

  try {
    await fs.rename(staging, targetDir)
  } catch (error) {
    if (hasBackup) {
      await fs.rename(backup, targetDir).catch(() => undefined)
    }
    throw error
  }

  if (hasBackup) {
    await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function writeManifest(dir: string, manifest: ComponentManifest): Promise<void> {
  await fs.writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  )
}
