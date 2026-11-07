export type CapabilityGroup = 'image' | 'video' | 'text' | 'audio'
export type CanvasScrollMode = 'pan' | 'zoom'
export type CanvasGridStyle = 'dots' | 'lines' | 'none'
export type UpdateChannel = 'stable' | 'beta'
export type ProxyMode = 'direct' | 'system' | 'manual'

export interface Preferences {
  version: 1
  startup: {
    /** 启动时自动打开最近项目；关闭后进入项目中心 */
    openRecentProject: boolean
  }
  project: {
    /** 自动保存防抖间隔（毫秒） */
    autoSaveDelay: number
    /** 关闭窗口时若有未保存修改则确认 */
    confirmBeforeClose: boolean
    /** 新项目默认目录；空字符串使用「文档/CineLab」 */
    defaultDir: string
  }
  canvas: {
    snapToGrid: boolean
    minimapVisible: boolean
    edgesVisible: boolean
    reduceMotion: boolean
    /** 滚轮行为：平移画布或缩放画布 */
    scrollMode: CanvasScrollMode
    zoomOnDoubleClick: boolean
    gridStyle: CanvasGridStyle
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
    /** 可重试错误自动重试次数 */
    autoRetry: number
    /** 默认开启 AI 水印 */
    watermark: boolean
    /** 生成历史保留条数，0 表示不持久化 */
    historyLimit: number
  }
  updates: {
    /** 启动后静默检查更新 */
    checkOnStartup: boolean
    channel: UpdateChannel
  }
  storage: {
    /** 自动清理缩略图缓存的天数，0 表示不清理 */
    autoCleanCacheDays: number
  }
  ui: {
    /** 界面缩放百分比 */
    scale: number
  }
  network: {
    proxyMode: ProxyMode
    /** 手动代理地址，例如 http://127.0.0.1:7890 */
    proxyUrl: string
    /** 单次模型请求超时（毫秒） */
    requestTimeout: number
  }
}

export const PREFERENCES_VERSION = 1

export const AUTO_SAVE_DELAYS = [300, 600, 1000, 3000] as const
export const GENERATION_CONCURRENCY = [1, 2, 3, 4] as const
export const HISTORY_LIMITS = [0, 20, 50, 100] as const
export const AUTO_RETRY_COUNTS = [0, 1, 2] as const
export const UI_SCALES = [90, 100, 110, 125] as const
export const CACHE_CLEAN_DAYS = [0, 30, 90] as const
export const REQUEST_TIMEOUTS = [30000, 60000, 120000, 300000] as const

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_VERSION,
  startup: {
    openRecentProject: true
  },
  project: {
    autoSaveDelay: 600,
    confirmBeforeClose: true,
    defaultDir: ''
  },
  canvas: {
    snapToGrid: false,
    minimapVisible: false,
    edgesVisible: true,
    reduceMotion: false,
    scrollMode: 'pan',
    zoomOnDoubleClick: false,
    gridStyle: 'dots'
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
    autoRetry: 0,
    watermark: false,
    historyLimit: 50
  },
  updates: {
    checkOnStartup: true,
    channel: 'stable'
  },
  storage: {
    autoCleanCacheDays: 90
  },
  ui: {
    scale: 100
  },
  network: {
    proxyMode: 'direct',
    proxyUrl: '',
    requestTimeout: 120000
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

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === 'string' && allowed.includes(value as T)
    ? (value as T)
    : fallback
}

function readString(value: unknown, fallback: string, maxLength = 500): string {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, maxLength)
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
  const updates = isRecord(raw.updates) ? raw.updates : {}
  const storage = isRecord(raw.storage) ? raw.storage : {}
  const ui = isRecord(raw.ui) ? raw.ui : {}
  const network = isRecord(raw.network) ? raw.network : {}

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
      ),
      confirmBeforeClose: readBoolean(
        project.confirmBeforeClose,
        DEFAULT_PREFERENCES.project.confirmBeforeClose
      ),
      defaultDir: readString(
        project.defaultDir,
        DEFAULT_PREFERENCES.project.defaultDir
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
      edgesVisible: readBoolean(
        canvas.edgesVisible,
        DEFAULT_PREFERENCES.canvas.edgesVisible
      ),
      reduceMotion: readBoolean(
        canvas.reduceMotion,
        DEFAULT_PREFERENCES.canvas.reduceMotion
      ),
      scrollMode: readEnum(
        canvas.scrollMode,
        ['pan', 'zoom'] as const,
        DEFAULT_PREFERENCES.canvas.scrollMode
      ),
      zoomOnDoubleClick: readBoolean(
        canvas.zoomOnDoubleClick,
        DEFAULT_PREFERENCES.canvas.zoomOnDoubleClick
      ),
      gridStyle: readEnum(
        canvas.gridStyle,
        ['dots', 'lines', 'none'] as const,
        DEFAULT_PREFERENCES.canvas.gridStyle
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
      autoRetry: readNumber(
        generation.autoRetry,
        AUTO_RETRY_COUNTS,
        DEFAULT_PREFERENCES.generation.autoRetry
      ),
      watermark: readBoolean(
        generation.watermark,
        DEFAULT_PREFERENCES.generation.watermark
      ),
      historyLimit: readNumber(
        generation.historyLimit,
        HISTORY_LIMITS,
        DEFAULT_PREFERENCES.generation.historyLimit
      )
    },
    updates: {
      checkOnStartup: readBoolean(
        updates.checkOnStartup,
        DEFAULT_PREFERENCES.updates.checkOnStartup
      ),
      channel: readEnum(
        updates.channel,
        ['stable', 'beta'] as const,
        DEFAULT_PREFERENCES.updates.channel
      )
    },
    storage: {
      autoCleanCacheDays: readNumber(
        storage.autoCleanCacheDays,
        CACHE_CLEAN_DAYS,
        DEFAULT_PREFERENCES.storage.autoCleanCacheDays
      )
    },
    ui: {
      scale: readNumber(
        ui.scale,
        UI_SCALES,
        DEFAULT_PREFERENCES.ui.scale
      )
    },
    network: {
      proxyMode: readEnum(
        network.proxyMode,
        ['direct', 'system', 'manual'] as const,
        DEFAULT_PREFERENCES.network.proxyMode
      ),
      proxyUrl: readString(
        network.proxyUrl,
        DEFAULT_PREFERENCES.network.proxyUrl
      ),
      requestTimeout: readNumber(
        network.requestTimeout,
        REQUEST_TIMEOUTS,
        DEFAULT_PREFERENCES.network.requestTimeout
      )
    }
  }
}
