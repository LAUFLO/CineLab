import { app, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SceneObjectPreset } from '@shared/scene-object-presets'
import { normalizeObjectPreset } from '@shared/scene-object-presets'

function presetsFile(): string {
  return join(app.getPath('userData'), 'stage-object-presets.json')
}

function normalizeList(raw: unknown): SceneObjectPreset[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { presets?: unknown }).presets)
      ? ((raw as { presets: unknown[] }).presets)
      : []
  const list: SceneObjectPreset[] = []
  for (const item of source) {
    const preset = normalizeObjectPreset(item)
    if (preset) list.push(preset)
  }
  return list
}

export async function loadUserObjectPresets(): Promise<SceneObjectPreset[]> {
  try {
    const raw = await fs.readFile(presetsFile(), 'utf8')
    return normalizeList(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export async function saveUserObjectPresets(
  presets: unknown
): Promise<SceneObjectPreset[]> {
  const list = normalizeList(presets)
  await fs.mkdir(dirname(presetsFile()), { recursive: true })
  await fs.writeFile(presetsFile(), `${JSON.stringify(list, null, 2)}\n`, 'utf8')
  return list
}

export async function importUserObjectPresets(): Promise<SceneObjectPreset[]> {
  const result = await dialog.showOpenDialog({
    title: '导入物体类别表',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return loadUserObjectPresets()
  }
  const raw = await fs.readFile(result.filePaths[0], 'utf8')
  return saveUserObjectPresets(JSON.parse(raw) as unknown)
}

export async function exportUserObjectPresets(): Promise<boolean> {
  const presets = await loadUserObjectPresets()
  const result = await dialog.showSaveDialog({
    title: '导出物体类别表',
    defaultPath: 'stage-object-presets.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  await fs.writeFile(
    result.filePath,
    `${JSON.stringify(presets, null, 2)}\n`,
    'utf8'
  )
  return true
}
