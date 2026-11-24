import type { AgentToolDefinition } from '@shared/agent-tools'

/**
 * 素材与音频处理工具。
 * 只接受项目内相对路径，避免外部 Agent 读取任意本机文件。
 */
export const MEDIA_TOOLS: AgentToolDefinition[] = [
  {
    id: 'media.assetIngest',
    name: 'asset_ingest',
    description:
      '把项目内的一个文件登记为项目素材，按内容哈希归档到 assets 目录。path 必须是项目内相对路径，例如 assets/raw/clip.mp4。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '项目内相对路径，例如 assets/raw/clip.mp4'
        },
        kind: {
          type: 'string',
          enum: ['image', 'video', 'audio'],
          description: '素材类型；省略时按扩展名推断'
        },
        mime: {
          type: 'string',
          description: 'MIME 类型；省略时按扩展名推断'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '素材入库', category: '资产' }
  },
  {
    id: 'media.stemSeparate',
    name: 'stem_separate',
    description:
      '对项目内的视频或音频执行人声/背景音分离。path 必须是项目内相对路径；需要本机已安装 Demucs 组件，耗时较长。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '项目内素材相对路径，例如 assets/vid/clip.mp4'
        },
        mode: {
          type: 'string',
          enum: ['vocal', 'background'],
          description: 'vocal 提取人声，background 提取背景音'
        },
        sourceKind: {
          type: 'string',
          enum: ['video', 'audio'],
          description: '源素材类型；省略时自动探测'
        }
      },
      required: ['path', 'mode'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '人声/背景音分离', category: '资产' }
  }
]
