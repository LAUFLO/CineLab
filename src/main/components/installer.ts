import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import extract from 'extract-zip'
import type { ComponentKind, ComponentManifest } from '@shared/components'

export const MODEL_FILE = 'video_depth_anything_vits.pth'

export async function installComponentFiles(
  kind: ComponentKind,
  downloadPath: string,
  targetDir: string,
  manifest: ComponentManifest
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  if (kind === 'depth-model') {
    const destination = join(targetDir, MODEL_FILE)
    await fs.rm(destination, { force: true })
    await fs.rename(downloadPath, destination)
    await writeManifest(targetDir, manifest)
    return
  }

  const staging = `${targetDir}.staging`
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(staging, { recursive: true })

  try {
    await extract(downloadPath, { dir: staging })
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
