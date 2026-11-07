export type CapabilityGroup = 'image' | 'video' | 'text' | 'audio'

export interface Preferences {
  version: 1
  startup: {
    /** 启动时自动打开最近项目；关闭后进入项目中心 */
    openRecentProject: boolean
  }
  project: {
    /** 自动保存防抖间隔（毫秒） */
    autoSaveDelay: number
  }
  canvas: {
    snapToGrid: boolean
    minimapVisible: boolean
    reduceMotion: boolean
  }
  generation: {
    /** 各能力最近使用/指定的默认模型，格式 providerId/modelId */
    defaultModels: Record<CapabilityGroup, string | null>
    /** 同时生成的任务数 */
    concurrency: number
    /** 窗口不在前台时发送系统通知 */
    notifyOnComplete: boolean
    /** 智能引用 AutoLink 默认开启 */
    autoLink: boolean
    /** 生成历史保留条数，0 表示不持久化 */
    historyLimit: number
  }
}

export const PREFERENCES_VERSION = 1

export const AUTO_SAVE_DELAYS = [300, 600, 1000, 3000] as const
export const GENERATION_CONCURRENCY = [1, 2, 3, 4] as const
export const HISTORY_LIMITS = [0, 20, 50, 100] as const

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_VERSION,
  startup: {
    openRecentProject: true
  },
  project: {
    autoSaveDelay: 600
  },
  canvas: {
    snapToGrid: false,
    minimapVisible: false,
    reduceMotion: false
  },
  generation: {
    defaultModels: {
      image: null,
      video: null,
      text: null,
      audio: null
    },
    concurrency: 2,
    notifyOnComplete: true,
    autoLink: true,
    historyLimit: 50
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readNumber(
  value: unknown,
  allowed: readonly number[],
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return allowed.includes(value) ? value : fallback
}

function readModel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** 逐字段校验并合并默认值，任何脏数据都回退到默认值 */
export function normalizePreferences(input: unknown): Preferences {
  const raw = isRecord(input) ? input : {}
  const startup = isRecord(raw.startup) ? raw.startup : {}
  const project = isRecord(raw.project) ? raw.project : {}
  const canvas = isRecord(raw.canvas) ? raw.canvas : {}
  const generation = isRecord(raw.generation) ? raw.generation : {}
  const defaultModels = isRecord(generation.defaultModels)
    ? generation.defaultModels
    : {}

  return {
    version: PREFERENCES_VERSION,
    startup: {
      openRecentProject: readBoolean(
        startup.openRecentProject,
        DEFAULT_PREFERENCES.startup.openRecentProject
      )
    },
    project: {
      autoSaveDelay: readNumber(
        project.autoSaveDelay,
        AUTO_SAVE_DELAYS,
        DEFAULT_PREFERENCES.project.autoSaveDelay
      )
    },
    canvas: {
      snapToGrid: readBoolean(
        canvas.snapToGrid,
        DEFAULT_PREFERENCES.canvas.snapToGrid
      ),
      minimapVisible: readBoolean(
        canvas.minimapVisible,
        DEFAULT_PREFERENCES.canvas.minimapVisible
      ),
      reduceMotion: readBoolean(
        canvas.reduceMotion,
        DEFAULT_PREFERENCES.canvas.reduceMotion
      )
    },
    generation: {
      defaultModels: {
        image: readModel(defaultModels.image),
        video: readModel(defaultModels.video),
        text: readModel(defaultModels.text),
        audio: readModel(defaultModels.audio)
      },
      concurrency: readNumber(
        generation.concurrency,
        GENERATION_CONCURRENCY,
        DEFAULT_PREFERENCES.generation.concurrency
      ),
      notifyOnComplete: readBoolean(
        generation.notifyOnComplete,
        DEFAULT_PREFERENCES.generation.notifyOnComplete
      ),
      autoLink: readBoolean(
        generation.autoLink,
        DEFAULT_PREFERENCES.generation.autoLink
      ),
      historyLimit: readNumber(
        generation.historyLimit,
        HISTORY_LIMITS,
        DEFAULT_PREFERENCES.generation.historyLimit
      )
    }
  }
}
