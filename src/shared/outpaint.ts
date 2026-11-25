import type { ModelDef, ParamDef } from './provider-schema'
import { parseAspectRatio } from './media'

/** 扩图支持的目标比例，与节点菜单、Agent itemOptions 共用。 */
export const OUTPAINT_RATIOS = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '21:9'
] as const

export type OutpaintRatio = (typeof OUTPAINT_RATIOS)[number]

export type OutpaintParamTarget =
  | 'ratio'
  | 'aspect_ratio'
  | 'size'
  | 'width-height'

export interface OutpaintSupport {
  /** 模型是否能用于扩图（有不低于近似比例的可控尺寸参数） */
  supported: boolean
  /** 需要合并进生成请求的参数 */
  params: Record<string, unknown>
  /** 参数落点，便于 Agent 和测试定位 */
  target?: OutpaintParamTarget
  /** 是否精确命中目标比例 */
  exact?: boolean
  /** 实际比例的说明，例如 1536x1024（3:2） */
  effective?: string
  /** 不支持时给用户看的原因 */
  reason?: string
}

export interface OutpaintPlan extends OutpaintSupport {
  /** 已补充目标画幅说明的提示词 */
  prompt: string
}

const RATIO_EPSILON = 0.002
const DEFAULT_LONG_EDGE = 1024
const DEFAULT_MIN_EDGE = 64
const DEFAULT_MAX_EDGE = 4096

export function isOutpaintRatio(value: unknown): value is OutpaintRatio {
  return (
    typeof value === 'string' &&
    (OUTPAINT_RATIOS as readonly string[]).includes(value)
  )
}

/** 未传或非法时使用主按钮默认比例。 */
export function outpaintRatioOf(value?: string | null): OutpaintRatio {
  return isOutpaintRatio(value) ? value : '16:9'
}

function parseAspect(value: string): number | null {
  return parseAspectRatio(value)?.value ?? null
}

function parseSize(value: string): { width: number; height: number } | null {
  const match = /^\s*(\d{2,5})\s*[xX×*]\s*(\d{2,5})\s*$/.exec(value)
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a))
  let right = Math.abs(Math.round(b))
  while (right > 0) {
    const remainder = left % right
    left = right
    right = remainder
  }
  return left || 1
}

function edgeBounds(param: ParamDef): { min: number; max: number } {
  const min =
    typeof param.min === 'number' && param.min > 0
      ? Math.round(param.min)
      : DEFAULT_MIN_EDGE
  const max =
    typeof param.max === 'number' && param.max > 0
      ? Math.round(param.max)
      : DEFAULT_MAX_EDGE
  return { min, max: Math.max(min, max) }
}

/** 只认图生图（i2i）模式下可用的参数。 */
function appliesToImageEdit(param: ParamDef): boolean {
  if (param.appliesTo && !param.appliesTo.includes('i2i')) return false
  if (param.when?.mode && param.when.mode !== 'i2i') return false
  return true
}

/**
 * 用目标比例的整数比构造尺寸。
 * 优先选择能被 8 整除的尺寸，其次偶数，最后任意整数。
 */
function buildExactSize(
  ratio: OutpaintRatio,
  widthBounds: { min: number; max: number },
  heightBounds: { min: number; max: number }
): { width: number; height: number } | null {
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
  const divisor = greatestCommonDivisor(ratioWidth, ratioHeight)
  const baseWidth = ratioWidth / divisor
  const baseHeight = ratioHeight / divisor
  const maxMultiple = Math.floor(
    Math.min(widthBounds.max / baseWidth, heightBounds.max / baseHeight)
  )

  let best: { width: number; height: number } | null = null
  let bestTier = Number.POSITIVE_INFINITY
  let bestDistance = Number.POSITIVE_INFINITY

  for (let multiple = 1; multiple <= maxMultiple; multiple += 1) {
    const width = baseWidth * multiple
    const height = baseHeight * multiple
    if (width < widthBounds.min || height < heightBounds.min) continue

    const tier =
      width % 8 === 0 && height % 8 === 0
        ? 0
        : width % 2 === 0 && height % 2 === 0
          ? 1
          : 2
    const distance = Math.abs(Math.max(width, height) - DEFAULT_LONG_EDGE)

    if (tier < bestTier || (tier === bestTier && distance < bestDistance)) {
      best = { width, height }
      bestTier = tier
      bestDistance = distance
    }
  }

  return best
}

function reducedRatioLabel(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height)
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

function ratioOptionEffective(value: string, label?: string): string {
  return parseAspectRatio(value)
    ? value.trim()
    : label?.trim() || value.trim()
}

interface OutpaintCandidate {
  target: OutpaintParamTarget
  params: Record<string, unknown>
  error: number
  exact: boolean
  effective: string
}

function betterCandidate(
  current: OutpaintCandidate | null,
  candidate: OutpaintCandidate
): OutpaintCandidate {
  if (!current) return candidate
  if (candidate.exact && !current.exact) return candidate
  if (candidate.exact === current.exact && candidate.error < current.error) {
    return candidate
  }
  return current
}

/** 比例类参数：优先精确选项，其次最接近的选项，最后允许自定义时用目标比例。 */
function ratioParamCandidate(
  param: ParamDef,
  ratio: OutpaintRatio
): OutpaintCandidate | null {
  const target = parseAspect(ratio)
  if (target === null) return null
  const targetName: OutpaintParamTarget =
    param.key === 'ratio' ? 'ratio' : 'aspect_ratio'

  let best: OutpaintCandidate | null = null
  for (const option of param.options ?? []) {
    const actual = parseAspect(option.value)
    if (actual === null) continue
    const error = Math.abs(actual - target)
    best = betterCandidate(best, {
      target: targetName,
      params: { [param.key]: option.value },
      error,
      exact: error <= RATIO_EPSILON,
      effective: ratioOptionEffective(option.value, option.label)
    })
  }

  if (best?.exact) return best
  if (param.type === 'text' || param.allowCustom) {
    return {
      target: targetName,
      params: { [param.key]: ratio },
      error: 0,
      exact: true,
      effective: ratio
    }
  }
  return best
}

/** 尺寸类参数：优先精确选项，其次最接近的选项，最后允许自定义时构造精确尺寸。 */
function sizeParamCandidate(
  param: ParamDef,
  ratio: OutpaintRatio
): OutpaintCandidate | null {
  const target = parseAspect(ratio)
  if (target === null) return null

  let best: OutpaintCandidate | null = null
  for (const option of param.options ?? []) {
    const size = parseSize(option.value)
    if (!size) continue
    const error = Math.abs(size.width / size.height - target)
    const exact = error <= RATIO_EPSILON
    best = betterCandidate(best, {
      target: 'size',
      params: { [param.key]: option.value },
      error,
      exact,
      effective: `${option.value}（${
        exact ? ratio : reducedRatioLabel(size.width, size.height)
      }）`
    })
  }

  if (best?.exact) return best
  if (param.type === 'text' || param.allowCustom) {
    const size = buildExactSize(
      ratio,
      { min: DEFAULT_MIN_EDGE, max: DEFAULT_MAX_EDGE },
      { min: DEFAULT_MIN_EDGE, max: DEFAULT_MAX_EDGE }
    )
    if (!size) return best
    return {
      target: 'size',
      params: { [param.key]: `${size.width}x${size.height}` },
      error: 0,
      exact: true,
      effective: `${size.width}x${size.height}（${ratio}）`
    }
  }
  return best
}

function applyWidthHeight(
  model: ModelDef,
  ratio: OutpaintRatio
): { width: number; height: number } | null {
  const widthParam = model.params.find(
    (param) => param.key === 'width' && appliesToImageEdit(param)
  )
  const heightParam = model.params.find(
    (param) => param.key === 'height' && appliesToImageEdit(param)
  )
  if (!widthParam || !heightParam) return null
  if (widthParam.type !== 'number' || heightParam.type !== 'number') return null

  return buildExactSize(
    ratio,
    edgeBounds(widthParam),
    edgeBounds(heightParam)
  )
}

function widthHeightCandidate(
  model: ModelDef,
  ratio: OutpaintRatio
): OutpaintCandidate | null {
  const size = applyWidthHeight(model, ratio)
  if (!size) return null
  return {
    target: 'width-height',
    params: { width: size.width, height: size.height },
    error: 0,
    exact: true,
    effective: `${size.width}x${size.height}（${ratio}）`
  }
}

/**
 * 判断模型能否用于扩图。
 * 优先精确命中目标比例；没有精确选项时选最接近的尺寸，并标记 exact=false。
 * 完全没有比例或尺寸参数的模型才不支持。
 */
export function outpaintSupport(
  model: ModelDef,
  ratio: OutpaintRatio
): OutpaintSupport {
  const candidates: OutpaintCandidate[] = []

  const ratioParam = model.params.find(
    (param) => param.key === 'ratio' && appliesToImageEdit(param)
  )
  if (ratioParam) {
    const candidate = ratioParamCandidate(ratioParam, ratio)
    if (candidate) candidates.push(candidate)
  }

  const aspectRatioParam = model.params.find(
    (param) => param.key === 'aspect_ratio' && appliesToImageEdit(param)
  )
  if (aspectRatioParam) {
    const candidate = ratioParamCandidate(aspectRatioParam, ratio)
    if (candidate) candidates.push(candidate)
  }

  const sizeParam = model.params.find(
    (param) => param.key === 'size' && appliesToImageEdit(param)
  )
  if (sizeParam) {
    const candidate = sizeParamCandidate(sizeParam, ratio)
    if (candidate) candidates.push(candidate)
  }

  const widthHeight = widthHeightCandidate(model, ratio)
  if (widthHeight) candidates.push(widthHeight)

  let best: OutpaintCandidate | null = null
  for (const candidate of candidates) {
    best = betterCandidate(best, candidate)
  }

  if (!best) {
    return {
      supported: false,
      params: {},
      reason: '该模型没有可用于扩图的比例或尺寸参数'
    }
  }

  return {
    supported: true,
    params: best.params,
    target: best.target,
    exact: best.exact,
    effective: best.effective
  }
}

/** 在提示词末尾补充目标画幅；已包含时不重复追加。 */
export function outpaintPrompt(
  prompt: string,
  ratio: OutpaintRatio
): string {
  const trimmed = prompt.trim()
  if (trimmed.includes(`目标画幅：${ratio}`)) return trimmed

  const suffix = `目标画幅：${ratio}。保持原图内容不变，只向画面外扩展并补全环境。`
  return trimmed ? `${trimmed}\n\n${suffix}` : suffix
}

/** 尺寸参数是否是像素宽高（而不是 1K / 2K 这类清晰度档位）。 */
function isPixelSizeParam(param: ParamDef | undefined): boolean {
  if (!param || !param.options || param.options.length === 0) return false
  return param.options.every((option) => parseSize(option.value) !== null)
}

/**
 * 生成扩图的最终参数和提示词。
 * baseParams 通常是模型默认参数；不支持时保持原参数并返回原因。
 */
export function planOutpaint(
  model: ModelDef,
  prompt: string,
  ratio: OutpaintRatio,
  baseParams: Record<string, unknown> = {}
): OutpaintPlan {
  const support = outpaintSupport(model, ratio)
  if (!support.supported) return { ...support, prompt }

  const params = { ...baseParams }
  const sizeParam = model.params.find(
    (param) => param.key === 'size' && appliesToImageEdit(param)
  )
  if (support.target === 'ratio' || support.target === 'aspect_ratio') {
    // 同时存在比例和像素尺寸时，保留比例作为唯一宽高来源；1K/2K 档位保留。
    if (isPixelSizeParam(sizeParam)) delete params.size
  } else if (support.target === 'size') {
    delete params.ratio
    delete params.aspect_ratio
  } else if (support.target === 'width-height') {
    delete params.ratio
    delete params.aspect_ratio
    if (isPixelSizeParam(sizeParam)) delete params.size
  }

  return {
    ...support,
    params: { ...params, ...support.params },
    prompt: outpaintPrompt(prompt, ratio)
  }
}
