import { net } from 'electron'
import type { ComponentKind, ComponentManifest } from '@shared/components'

export interface ComponentDefinition {
  kind: ComponentKind
  label: string
  directory: string
  manifestUrl: string
  fallback: ComponentManifest
}

const platform = `${process.platform}-${process.arch}`

// 正式地址在组件发布后替换；开发期可用 CINELAB_COMPONENT_BASE_URL 指向本地 mock。
const baseUrl =
  process.env.CINELAB_COMPONENT_BASE_URL ??
  'https://github.com/LAUFLO/CineLab/releases/download/depth-components-v1'

function fallback(kind: ComponentKind, urls: string[] = []): ComponentManifest {
  return {
    version: 1,
    kind,
    platform,
    size: 0,
    expandedSize: 0,
    sha256: '',
    urls,
    files: 0
  }
}

export const COMPONENTS: Record<ComponentKind, ComponentDefinition> = {
  'depth-runtime': {
    kind: 'depth-runtime',
    label: '深度运行时',
    directory: 'depth-runtime',
    manifestUrl: `${baseUrl}/depth-runtime-manifest.json`,
    fallback: fallback('depth-runtime', [`${baseUrl}/depth-runtime-${platform}.zip`])
  },
  'depth-model': {
    kind: 'depth-model',
    label: 'VDA Small 模型',
    directory: 'depth-model-vda-small',
    manifestUrl: `${baseUrl}/depth-model-vda-small-manifest.json`,
    fallback: fallback('depth-model', [
      `${baseUrl}/video_depth_anything_vits.pth`
    ])
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
