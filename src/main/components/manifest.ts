import { net } from 'electron'
import type { ComponentKind, ComponentManifest } from '@shared/components'

export interface ComponentDefinition {
  kind: ComponentKind
  label: string
  directory: string
  manifestUrl?: string
  fallback: ComponentManifest
}

const platform = `${process.platform}-${process.arch}`

// runtime 没有官方现成包，需要自建；开发期可用 CINELAB_COMPONENT_BASE_URL 指向本地 mock。
const runtimeBaseUrl =
  process.env.CINELAB_COMPONENT_BASE_URL ??
  'https://github.com/LAUFLO/CineLab/releases/download/depth-components-v1'

const visionBaseUrl =
  process.env.CINELAB_VISION_BASE_URL ??
  process.env.CINELAB_COMPONENT_BASE_URL ??
  'https://github.com/LAUFLO/CineLab/releases/download/vision-components-v1'

const MODEL_URLS = [
  'https://huggingface.co/depth-anything/Video-Depth-Anything-Small/resolve/main/video_depth_anything_vits.pth',
  'https://hf-mirror.com/depth-anything/Video-Depth-Anything-Small/resolve/main/video_depth_anything_vits.pth'
]
const MODEL_SIZE = 116_440_756
const MODEL_SHA256 =
  '13379300b739e659f076a59d52e9801bd8d38c541a7e71f73bbca4dcfb013609'

function fallback(
  kind: ComponentKind,
  urls: string[] = [],
  overrides: Partial<ComponentManifest> = {}
): ComponentManifest {
  return {
    version: 1,
    kind,
    platform,
    size: 0,
    expandedSize: 0,
    sha256: '',
    urls,
    files: 0,
    ...overrides
  }
}

export const COMPONENTS: Record<ComponentKind, ComponentDefinition> = {
  'depth-runtime': {
    kind: 'depth-runtime',
    label: '深度运行时',
    directory: 'depth-runtime',
    manifestUrl: `${runtimeBaseUrl}/depth-runtime-manifest.json`,
    fallback: fallback('depth-runtime', [
      `${runtimeBaseUrl}/depth-runtime-win32-x64-v1.zip`
    ])
  },
  'depth-model': {
    kind: 'depth-model',
    label: 'VDA Small 模型',
    directory: 'depth-model-vda-small',
    // 模型直接使用官方权重，不再依赖自建 manifest
    fallback: fallback('depth-model', MODEL_URLS, {
      size: MODEL_SIZE,
      expandedSize: MODEL_SIZE,
      sha256: MODEL_SHA256,
      files: 1
    })
  },
  'vision-models': {
    kind: 'vision-models',
    label: '视觉模型（RVM + LaMa）',
    directory: 'vision-models',
    manifestUrl: `${visionBaseUrl}/vision-models-manifest.json`,
    fallback: fallback('vision-models', [
      `${visionBaseUrl}/vision-models-win32-x64-v1.zip`
    ], {
      size: 213_355_635,
      expandedSize: 240_714_601,
      sha256: '44934097a19fc6806740aab51965c24fab52926e5a47f86c9dae731253c57803',
      files: 332
    })
  }
}

export const COMPONENT_KINDS = Object.keys(COMPONENTS) as ComponentKind[]

function isManifest(value: unknown, kind: ComponentKind): value is ComponentManifest {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ComponentManifest>
  return (
    item.kind === kind &&
    typeof item.version === 'number' &&
    Number.isInteger(item.version) &&
    item.version > 0 &&
    typeof item.platform === 'string' &&
    typeof item.size === 'number' &&
    typeof item.expandedSize === 'number' &&
    typeof item.sha256 === 'string' &&
    Array.isArray(item.urls) &&
    item.urls.every((url) => typeof url === 'string' && url.length > 0) &&
    typeof item.files === 'number'
  )
}

export async function fetchManifest(
  definition: ComponentDefinition,
  signal?: AbortSignal
): Promise<ComponentManifest> {
  if (!definition.manifestUrl) return definition.fallback

  const timeout = AbortSignal.timeout(15_000)
  const combined = signal
    ? AbortSignal.any([signal, timeout])
    : timeout

  try {
    const response = await net.fetch(definition.manifestUrl, {
      signal: combined,
      redirect: 'follow'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload: unknown = await response.json()
    if (!isManifest(payload, definition.kind)) {
      throw new Error('组件清单格式无效')
    }
    if (payload.platform !== platform) {
      throw new Error(`组件不支持当前平台：${payload.platform}`)
    }
    return payload
  } catch (error) {
    if (signal?.aborted) throw error
    // 清单拉取失败时退回内置地址；真实下载时仍会做 sha256 校验。
    return definition.fallback
  }
}
