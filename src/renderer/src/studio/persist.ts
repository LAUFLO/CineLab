import type { TimelineDoc } from '@shared/timeline-schema'

const TIMELINE_PREFIX = 'cinelab.studio.timeline.'
const LAYOUT_KEY = 'cinelab.studio.layout'

export interface StudioLayout {
  leftOpen: boolean
  rightOpen: boolean
  timelineRatio: number
}

export function loadTimeline(projectPath: string | null): TimelineDoc | null {
  if (!projectPath) return null
  try {
    const raw = localStorage.getItem(TIMELINE_PREFIX + projectPath)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TimelineDoc
    return parsed && Array.isArray(parsed.clips) ? parsed : null
  } catch {
    return null
  }
}

/** 旧版本时间线已迁移到 timelines/<id>.json 后清除，避免重复迁移 */
export function clearLegacyTimeline(projectPath: string | null): void {
  if (!projectPath) return
  try {
    localStorage.removeItem(TIMELINE_PREFIX + projectPath)
  } catch {
    // 忽略
  }
}

export function loadLayout(): StudioLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StudioLayout>
    return {
      leftOpen: parsed.leftOpen ?? true,
      rightOpen: parsed.rightOpen ?? true,
      timelineRatio:
        typeof parsed.timelineRatio === 'number'
          ? Math.min(0.6, Math.max(0.25, parsed.timelineRatio))
          : 0.4
    }
  } catch {
    return null
  }
}

export function saveLayout(layout: StudioLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // 忽略
  }
}
