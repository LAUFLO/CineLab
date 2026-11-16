import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { assetUrl } from '../lib/asset-url'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { Icon } from './Icon'
import { Button } from './ui'

interface ProjectCardProps {
  project: RecentProject
  onOpen: (path: string) => void
  onChanged?: () => void
  canPickCanvas?: boolean
}

interface CanvasImage {
  id: string
  path: string
  title: string
}

function useCanvasImages(enabled: boolean): CanvasImage[] {
  const nodes = useCanvasStore((state) => state.nodes)

  return useMemo(() => {
    if (!enabled) return []

    const seen = new Set<string>()
    const images: CanvasImage[] = []

    for (const node of nodes) {
      if (
        isGroupNode(node) ||
        node.type !== 'cine' ||
        node.data.kind !== 'image'
      ) {
        continue
      }

      for (const output of node.data.outputs ?? []) {
        if (output.kind !== 'image' || output.scope === 'global') continue
        if (seen.has(output.path)) continue
        seen.add(output.path)
        images.push({
          id: output.id,
          path: output.path,
          title: node.data.title
        })
      }
    }

    return images
  }, [enabled, nodes])
}

export function ProjectCard({
  project,
  onOpen,
  onChanged,
  canPickCanvas = false
}: ProjectCardProps) {
  const [cover, setCover] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const canvasImages = useCanvasImages(pickerOpen && canPickCanvas)

  const refreshCover = async (): Promise<void> => {
    const url = await window.api.project.readCover(project.path)
    setCover(url)
  }

  useEffect(() => {
    void refreshCover()
  }, [project.path])

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const setLocal = async (): Promise<void> => {
    setMenuOpen(false)
    setBusy(true)
    try {
      const result = await window.api.project.setCoverFromLocal(project.path)
      if (result.ok) {
        await refreshCover()
        onChanged?.()
      }
    } finally {
      setBusy(false)
    }
  }

  const setAsset = async (assetPath: string): Promise<void> => {
    setPickerOpen(false)
    setBusy(true)
    try {
      const result = await window.api.project.setCoverFromAsset(
        project.path,
        assetPath
      )
      if (result.ok) {
        await refreshCover()
        onChanged?.()
      }
    } finally {
      setBusy(false)
    }
  }

  const removeCover = async (): Promise<void> => {
    setMenuOpen(false)
    setBusy(true)
    try {
      await window.api.project.removeCover(project.path)
      await refreshCover()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="project-card"
      className="group relative rounded-xl border border-border bg-surface-raised p-3 text-left hover:border-border-strong hover:bg-surface-hover"
    >
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="mb-2.5 flex aspect-square w-full items-center justify-center rounded-lg border-0 bg-surface-hover p-0 text-fg-subtle"
        onClick={() => onOpen(project.path)}
        title={`打开 ${project.name}`}
      >
        {cover ? (
          <img src={cover} alt="" className="h-full w-full rounded-[inherit] object-cover" />
        ) : (
          <Icon name="folder" size={22} />
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="flex w-full flex-col !items-start border-0 bg-transparent p-0 !text-left"
        onClick={() => onOpen(project.path)}
      >
        <span className="block w-full text-[13px] text-fg">{project.name}</span>
        <span
          className="mt-[3px] block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-fg-subtle"
          title={project.path}
        >
          {project.path}
        </span>
        <span className="mt-1 block text-[10px] text-fg-subtle">
          {new Date(project.lastOpenedAt).toLocaleString('zh-CN')}
        </span>
      </Button>

      <div className="absolute right-2.5 top-2.5 z-[5]" ref={menuRef}>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface p-0 text-fg-muted opacity-0 transition-opacity duration-150 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
          title="更换封面"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={busy}
        >
          <Icon name="image" size={14} />
        </Button>

        {menuOpen ? (
          <div className="absolute right-0 top-8 flex min-w-[132px] flex-col rounded-lg border border-border bg-surface-raised p-1 shadow-menu">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="h-[30px] rounded-md px-2.5 !justify-start text-xs text-fg hover:bg-surface-hover"
              onClick={() => void setLocal()}
            >
              从本地选择
            </Button>
            {canPickCanvas ? (
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="h-[30px] rounded-md px-2.5 !justify-start text-xs text-fg hover:bg-surface-hover"
                onClick={() => {
                  setMenuOpen(false)
                  setPickerOpen(true)
                }}
              >
                从画布选择
              </Button>
            ) : null}
            {cover ? (
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="h-[30px] rounded-md px-2.5 !justify-start text-xs text-danger hover:bg-surface-hover"
                onClick={() => void removeCover()}
              >
                移除封面
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {pickerOpen ? (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-8"
          onPointerDown={() => setPickerOpen(false)}
        >
          <div
            className="flex max-h-[min(560px,80vh)] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-float"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-divider px-4 text-[14px] text-fg">
              <span>选择画布图片</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPickerOpen(false)}
                aria-label="关闭"
              >
                <Icon name="close" size={14} />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {canvasImages.length > 0 ? (
                <div className="grid grid-cols-4 gap-3">
                  {canvasImages.map((image) => (
                    <Button
                      key={image.id}
                      type="button"
                      variant="ghost"
                      size="none"
                      className="rounded-[10px] border border-border bg-surface-raised p-2 !text-left hover:border-border-strong hover:bg-surface-hover"
                      onClick={() => void setAsset(image.path)}
                    >
                      <img
                        src={assetUrl(image.path)}
                        alt=""
                        className="mb-1.5 aspect-square w-full rounded-md object-cover"
                      />
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-fg-muted">
                        {image.title}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-12 text-center text-[13px] text-fg-subtle">
                  当前画布没有可用的图片素材
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
