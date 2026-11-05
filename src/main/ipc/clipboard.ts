import { clipboard, ipcMain } from 'electron'
import type { ClipboardContent } from '../../shared/ipc-contract'
import { ingestAsset } from '../assets/ingest'
import { getCurrentProjectRoot } from '../project/manager'

async function readClipboard(): Promise<ClipboardContent> {
  const projectRoot = getCurrentProjectRoot()
  if (!projectRoot) return null

  const items = await clipboard.read()

  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (!imageType) continue

    const blob = await item.getType(imageType)
    if (!(blob instanceof Blob)) continue

    const data = Buffer.from(await blob.arrayBuffer())
    const asset = await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'image',
      mime: imageType,
      model: '剪贴板'
    })
    return { kind: 'image', asset }
  }

  const text = (await clipboard.readText()).trim()
  if (text) return { kind: 'text', text }

  return null
}

export function registerClipboardIpc(): void {
  ipcMain.handle('clipboard:read', () => readClipboard())
}
