import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { assetUrl } from '../lib/asset-url'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { Icon } from './Icon'

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
      if (isGroupNode(node) || node.data.kind !== 'image') continue

      for (const output of node.data.outputs ?? []) {
        if (output.kind !== 'image' || output.scope === 'global') continue
        if (seen.has(output.path)) continue
        seen.add(output.path)
        images.push({ id: output.id, path: output.path, title: node.data.title })
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
      const result = await window.api.project.setCoverFromAsset(project.path, assetPath)
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
    <div className="project-center__card">
      <button
        type="button"
        className="project-center__cover"
        onClick={() => onOpen(project.path)}
        title={`打开 ${project.name}`}
      >
        {cover ? <img src={cover} alt="" /> : <Icon name="folder" size={22} />}
      </button>

      <button
        type="button"
        className="project-center__card-info"
        onClick={() => onOpen(project.path)}
      >
        <span className="project-center__card-name">{project.name}</span>
        <span className="project-center__card-path" title={project.path}>
          {project.path}
        </span>
        <span className="project-center__card-time">
          {new Date(project.lastOpenedAt).toLocaleString('zh-CN')}
        </span>
      </button>

      <div className="project-card__menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="project-card__edit"
          title="更换封面"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={busy}
        >
          <Icon name="image" size={14} />
        </button>

        {menuOpen ? (
          <div className="project-card__menu">
            <button type="button" onClick={() => void setLocal()}>
              从本地选择
            </button>
            {canPickCanvas ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setPickerOpen(true)
                }}
              >
                从画布选择
              </button>
            ) : null}
            {cover ? (
              <button type="button" className="is-danger" onClick={() => void removeCover()}>
                移除封面
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {pickerOpen ? (
        <div className="cover-picker-overlay" onPointerDown={() => setPickerOpen(false)}>
          <div className="cover-picker" onPointerDown={(event) => event.stopPropagation()}>
            <header className="cover-picker__head">
              <span>选择画布图片</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPickerOpen(false)}
              >
                <Icon name="close" size={14} />
              </button>
            </header>

            <div className="cover-picker__body">
              {canvasImages.length > 0 ? (
                <div className="cover-picker__grid">
                  {canvasImages.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      className="cover-picker__item"
                      onClick={() => void setAsset(image.path)}
                    >
                      <img src={assetUrl(image.path)} alt="" />
                      <span>{image.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="cover-picker__empty">当前画布没有可用的图片素材</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
