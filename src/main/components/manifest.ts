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
const isWindows = process.platform === 'win32'
const depthManifestName = isWindows
  ? 'depth-runtime-manifest.json'
  : `depth-runtime-manifest-${platform}.json`

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
    label: '本地 AI 运行时',
    directory: 'depth-runtime',
    manifestUrl: `${runtimeBaseUrl}/${depthManifestName}`,
    fallback: fallback('depth-runtime', [
      `${runtimeBaseUrl}/depth-runtime-${platform}-v1.zip`
    ])
  },
  'depth-model': {
    kind: 'depth-model',
    label: 'VDA Small 模型',
    directory: 'depth-model-vda-small',
    // 远端 manifest 用于在线更新；缺失时回退到官方权重 URL。
    manifestUrl: `${runtimeBaseUrl}/depth-model-${platform}-manifest.json`,
    fallback: fallback('depth-model', MODEL_URLS, {
      size: MODEL_SIZE,
      expandedSize: MODEL_SIZE,
      sha256: MODEL_SHA256,
      files: 1
    })
  },
  'whisper-runtime': {
    kind: 'whisper-runtime',
    label: '本地字幕运行时',
    directory: 'whisper-runtime',
    manifestUrl: `${runtimeBaseUrl}/whisper-runtime-${platform}-manifest.json`,
    // 官方 whisper.cpp v1.7.6 Windows x64 包
    fallback: fallback(
      'whisper-runtime',
      isWindows
        ? [
            'https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip'
          ]
        : [`${runtimeBaseUrl}/whisper-runtime-${platform}-v1.zip`],
      isWindows
        ? {
            size: 3_675_974,
            expandedSize: 12_000_000,
            sha256:
              '0d2eca299c248f965bd0341bcb219db4b433c7f0c0ce2200d4df85765e8156a9',
            files: 22
          }
        : { size: 0, expandedSize: 0, sha256: '', files: 0 }
    )
  },
  'whisper-model': {
    kind: 'whisper-model',
    label: 'Whisper Base 模型',
    directory: 'whisper-model-base',
    manifestUrl: `${runtimeBaseUrl}/whisper-model-${platform}-manifest.json`,
    fallback: fallback(
      'whisper-model',
      [
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
        'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
      ],
      {
        size: 147_951_465,
        expandedSize: 147_951_465,
        sha256:
          '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
        files: 1
      }
    )
  },
  'vision-models': {
    kind: 'vision-models',
    label: '视觉模型（InSPyReNet + LaMa）',
    directory: 'vision-models',
    // 资产内容为纯 Python 源码 + 权重，不含平台二进制，Windows/macOS 共用。
    // 若未来加入 .so/.pyd/DLL 等平台文件，必须拆分为按平台的资产。
    manifestUrl: `${visionBaseUrl}/vision-models-manifest.json`,
    fallback: fallback('vision-models', [
      `${visionBaseUrl}/vision-models-v1.zip`
    ], {
      size: 526_828_343,
      expandedSize: 573_254_295,
      sha256: 'c00b66f631cb0231eaf286777170662658b7346123ccf16a09f5747e57a1a7f0',
      files: 11
    })
  },
  'stem-model': {
    kind: 'stem-model',
    label: 'HTDemucs 人声分离模型',
    directory: 'stem-model',
    manifestUrl: `${runtimeBaseUrl}/stem-model-${platform}-manifest.json`,
    // 模型不随应用重新分发；worker 代码随应用发布，这里只下载权重。
    fallback: fallback(
      'stem-model',
      [
        'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th',
        'https://huggingface.co/anchor-flux/demucs-htdemucs/resolve/main/htdemucs.th',
        'https://hf-mirror.com/anchor-flux/demucs-htdemucs/resolve/main/htdemucs.th'
      ],
      {
        size: 84_141_911,
        expandedSize: 84_141_911,
        sha256:
          '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4',
        files: 1
      }
    )
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
