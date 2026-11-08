import { app } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  ImportedSound,
  SoundAsset,
  SoundManifest
} from '@shared/sound-schema'

function soundsRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'sounds')
    : join(app.getAppPath(), 'resources', 'sounds')
}

export async function listSounds(): Promise<SoundAsset[]> {
  const raw = await fs.readFile(join(soundsRoot(), 'manifest.json'), 'utf8')
  const manifest = JSON.parse(raw) as SoundManifest
  return manifest.sounds
}

export async function importSound(
  projectRoot: string,
  id: string
): Promise<ImportedSound> {
  const sounds = await listSounds()
  const sound = sounds.find((item) => item.id === id)
  if (!sound) throw new Error('找不到该音效')

  const data = await fs.readFile(join(soundsRoot(), sound.file))
  const digest = createHash('sha256').update(data).digest('hex')
  if (digest !== sound.sha256) {
    throw new Error('音效文件校验失败，请重新安装应用')
  }

  const targetDir = join(projectRoot, 'assets', 'aud')
  await fs.mkdir(targetDir, { recursive: true })
  const ext = sound.file.slice(sound.file.lastIndexOf('.'))
  const fileName = `sfx-${sound.id}-${Date.now().toString(36)}${ext}`
  await fs.writeFile(join(targetDir, fileName), data)

  return {
    path: `assets/aud/${fileName}`,
    name: sound.name,
    durationMs: Math.round(sound.duration * 1000)
  }
}
