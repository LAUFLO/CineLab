import type { AssetScope } from './asset-schema'
import type { CalibratedScene, DepthStats } from './scene-calibrate'
import type { SceneDraft } from './scene-draft'
import type { PrevisWorldRef } from './previs/world-gen'

export interface SceneAnalyzeInput {
  /** 项目内或全局资产库中的图片相对路径 */
  imagePath: string
  imageScope?: AssetScope
  /** providerId/modelId；省略时自动选第一个 text.chat 模型 */
  modelKey?: string
  /** 强制覆盖图片解析出的世界风格 */
  styleOverride?: string
  seed?: number
  /** 可选深度统计；缺省按 16:9 估计 */
  depth?: DepthStats
}

export interface SceneAnalyzeResult {
  draft: SceneDraft
  world: PrevisWorldRef
  calibration: CalibratedScene
  confidence: 'high' | 'medium' | 'low'
}
