import type { ModelDef } from './provider-schema'
import { supportsReferenceAudio } from './provider-schema'
import { MODEL_MODE_LABEL, type ModelModeId } from './model-modes'
import {
  effectiveCapabilities,
  type EffectiveCapabilities
} from './capabilities'

export interface ReferenceInputContext {
  /** 当前节点是否为视频节点 */
  isVideo: boolean
  /** 当前输入模式；UI 传入，主进程可省略 */
  mode?: ModelModeId
  model: ModelDef
  /** 已计算的有效能力；省略时内部计算 */
  capabilities?: EffectiveCapabilities
  imageCount: number
  audioCount: number
  /** 是否带 request.video（源视频 / 参考视频） */
  hasSourceVideo: boolean
  /** request.video 是否用于视频编辑 / 续写（而不是全能参考） */
  hasVideoOperation: boolean
  hasMask: boolean
  /** refs 中是否存在首帧或尾帧 */
  hasKeyframe: boolean
  /** 首帧角色数量；传入后启用首尾帧结构校验 */
  firstFrameCount?: number
  /** 尾帧角色数量；传入后启用首尾帧结构校验 */
  lastFrameCount?: number
}

/**
 * 参考媒体能力闸门。
 *
 * 普通生成、Agent 提案和 PromptBar 共用这一入口：执行器不认识的媒体
 * 必须在这里报错，不能透传后静默丢弃。返回所有命中的错误。
 */
export function referenceInputErrors(
  ctx: ReferenceInputContext
): string[] {
  const {
    isVideo,
    mode,
    model,
    imageCount,
    audioCount,
    hasSourceVideo,
    hasVideoOperation,
    hasMask,
    hasKeyframe
  } = ctx
  const capabilities = ctx.capabilities ?? effectiveCapabilities(model)
  const supported = capabilities.media
  const errors: string[] = []
  const firstFrameCount = ctx.firstFrameCount
  const lastFrameCount = ctx.lastFrameCount

  // 首尾帧结构校验：UI、主进程和 Agent 提案共用同一套规则。
  // 新字段未传入时保持旧行为，避免影响只关心媒体类型的调用方。
  if (firstFrameCount !== undefined || lastFrameCount !== undefined) {
    const firsts = firstFrameCount ?? 0
    const lasts = lastFrameCount ?? 0
    const keyframes = firsts + lasts

    if (mode === 'first-frame' && (firsts !== 1 || lasts !== 0)) {
      errors.push('首帧模式需要 1 张首帧图片，不能带尾帧')
    }
    if (mode === 'first-last' && (firsts !== 1 || lasts !== 1)) {
      errors.push('首尾帧模式需要首帧和尾帧各 1 张')
    }
    if (mode === 'reference' && keyframes > 0) {
      errors.push('全能参考模式不能带首帧或尾帧，请切换输入模式')
    }
    if (firsts > 1) errors.push('首帧最多 1 张')
    if (lasts > 1) errors.push('尾帧最多 1 张')
    if (lasts > 0 && firsts === 0) {
      errors.push('尾帧不能单独使用，请先添加首帧')
    }
    if (keyframes > 0 && keyframes !== imageCount) {
      errors.push(
        mode === 'first-frame'
          ? '首帧模式不能混入其他参考图'
          : '首尾帧模式不能混入其他参考图'
      )
    }
  }

  if (audioCount > 0) {
    if (!isVideo) {
      errors.push('当前类型的模型不支持参考音频')
    } else if (!supportsReferenceAudio(model)) {
      errors.push(
        '当前模型不支持参考音频，请在设置 → 模型 → 模型配置中勾选「音频」输入'
      )
    } else if (!supported.includes('audio')) {
      errors.push('当前视频适配器暂不支持参考音频')
    } else if (mode && mode !== 'reference') {
      errors.push('当前输入模式不支持参考音频，请切换到全能参考模式')
    } else if (hasKeyframe) {
      errors.push('首尾帧模式不支持参考音频，请切换到全能参考模式')
    } else if (hasSourceVideo && hasVideoOperation) {
      errors.push('视频编辑模式不支持参考音频')
    } else if (capabilities.adapter !== 'agnes-video') {
      errors.push('当前视频适配器暂不支持参考音频')
    }
  }

  if (hasSourceVideo && hasKeyframe) {
    errors.push('首尾帧模式不支持参考视频，请切换到全能参考模式')
  } else if (hasSourceVideo && mode && mode !== 'reference') {
    errors.push('当前输入模式不支持参考视频，请切换到全能参考模式')
  }

  if (imageCount > 0 && !supported.includes('image')) {
    errors.push(
      '该模型不支持图片输入，请在设置 → 模型 → 模型配置中勾选「图片」'
    )
  }

  if (hasMask && !supported.includes('image')) {
    errors.push('该模型不支持蒙版编辑')
  }

  if (hasSourceVideo && !supported.includes('video')) {
    errors.push('该模型不支持参考视频，请选择支持视频输入的模型')
  }

  if (mode && !capabilities.modes.includes(mode)) {
    errors.push(
      `当前适配器不支持「${MODEL_MODE_LABEL[mode] ?? mode}」模式`
    )
  }

  return errors
}

/** 返回第一条命中的错误；全部通过返回 null */
export function referenceInputError(
  ctx: ReferenceInputContext
): string | null {
  return referenceInputErrors(ctx)[0] ?? null
}
