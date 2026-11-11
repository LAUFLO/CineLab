import type { AgentTurnChange } from '@shared/agent'
import {
  GRID_SPLIT_CELL_WIDTH,
  type NodeKind
} from '@shared/canvas-schema'
import { isVideoOperation, type VideoOperationId } from '@shared/operation-schema'
import {
  nodeOperationAgentSpec,
  validateNodeOperationParams,
  type NodeOperationParamSpec
} from '@shared/node-operation-specs'
import type { SubtitleRect } from '@shared/media'
import {
  absolutePosition,
  isGroupNode,
  nodeSize,
  selectedNodeOutput,
  useCanvasStore,
  type CanvasNode
} from '../../stores/canvas'
import { trackDepthTask } from '../../stores/depth-tasks'
import { trackVisionTask } from '../../stores/vision-tasks'
import {
  buildOperationPrompt,
  operationsForKind,
  type NodeOperation,
  type OperationMenuItem
} from './node-operations'
import { createStudyNodeFromVideo, runFilmStudyAuto } from './film-study-runner'

export type NodeOperationUiEffect =
  | {
      type: 'crop-dialog'
      path: string
      scope?: 'project' | 'global'
      width?: number
      height?: number
    }
  | { type: 'trim-dialog'; duration: number }
  | {
      type: 'mask-dialog'
      op: NodeOperation
      item?: OperationMenuItem
      prompt: string
    }
  | {
      type: 'ai-dialog'
      op: NodeOperation
      item?: OperationMenuItem
      prompt: string
    }
  | {
      type: 'subtitle-dialog'
      mode: 'delogo' | 'vision'
      title: string
      path: string
      scope?: 'project' | 'global'
      width?: number
      height?: number
    }
  | { type: 'depth-dialog'; duration: number }
  | { type: 'sphere-dialog'; kind: 'light' | 'camera' }
  | {
      type: 'settings'
      panel: 'models' | 'components'
      message: string
    }

export interface NodeOperationUiHost {
  effect: (effect: NodeOperationUiEffect) => void
  toast: (message: string, kind?: 'info' | 'error') => void
  setRunning?: (running: boolean) => void
  getCurrentTime?: (nodeId: string) => number | undefined
}

export interface NodeOperationRequest {
  nodeId: string
  operationId: string
  itemId?: string
  params?: Record<string, unknown>
  turnId?: string
}

export interface NodeOperationResult {
  ok: boolean
  result?: unknown
  error?: string
  change?: AgentTurnChange
  needsUi?: boolean
  needsGeneration?: boolean
}

export interface NodeOperationSummary {
  id: string
  label: string
  section?: string
  implemented: boolean
  agentExecutable: boolean
  generationProposable: boolean
  requiresConfirm: boolean
  requires?: NodeOperation['requires']
  reason?: string
  hint?: string
  menu?: OperationMenuItem[]
  prompt?: string
  itemPrompts?: Record<string, string>
  params?: NodeOperationParamSpec[]
}

export interface NodeOperationsSummary {
  node: {
    id: string
    title: string
    kind: string
    outputKind?: string
    hasAudio?: boolean
  }
  operations: NodeOperationSummary[]
}

function emptyChange(): AgentTurnChange {
  return {
    createdNodeIds: [],
    updatedNodeIds: [],
    deletedNodeIds: [],
    createdEdgeIds: [],
    deletedEdgeIds: [],
    previousTitles: {},
    previousPositions: {}
  }
}

function findNode(nodeId: string): CanvasNode | undefined {
  return useCanvasStore.getState().nodes.find((node) => node.id === nodeId)
}

function operationContext(node: CanvasNode) {
  const output = selectedNodeOutput(node)
  return {
    kind: node.data.kind as NodeKind,
    hasOutput: Boolean(output),
    hasAudio: output?.hasAudio
  }
}

export function listNodeOperations(
  nodeId: string
): NodeOperationsSummary | null {
  const node = findNode(nodeId)
  if (!node || node.type !== 'cine') return null
  const ctx = operationContext(node)
  const output = selectedNodeOutput(node)

  return {
    node: {
      id: node.id,
      title: String(node.data.title ?? ''),
      kind: node.data.kind,
      ...(output ? { outputKind: output.kind } : {}),
      ...(output?.hasAudio !== undefined ? { hasAudio: output.hasAudio } : {})
    },
    operations: operationsForKind(ctx.kind).map((op) => {
      const spec = nodeOperationAgentSpec(op.id)
      const reason = op.disabledReason?.(ctx) ?? null
      return {
        id: op.id,
        label: op.label,
        ...(op.section ? { section: op.section } : {}),
        implemented: op.implemented === true,
        agentExecutable: op.implemented === true && spec?.executable === true,
        generationProposable:
          op.implemented === true && spec?.generationProposable === true,
        requiresConfirm: spec?.requiresConfirm === true,
        ...(op.requires ? { requires: op.requires } : {}),
        ...(reason
          ? { reason }
          : spec?.reason
            ? { reason: spec.reason }
            : {}),
        ...(op.hint ? { hint: op.hint } : {}),
        ...(op.menu ? { menu: op.menu } : {}),
        ...(op.prompt ? { prompt: op.prompt } : {}),
        ...(op.promptByItem ? { itemPrompts: op.promptByItem } : {}),
        ...(spec?.params && spec.params.length > 0
          ? { params: spec.params }
          : {})
      }
    })
  }
}

function trackTurn(
  request: NodeOperationRequest,
  before: { nodes: Set<string>; edges: Set<string> }
): AgentTurnChange {
  const state = useCanvasStore.getState()
  const change = emptyChange()
  const afterNodes = new Set(state.nodes.map((node) => node.id))
  const afterEdges = new Set(state.edges.map((edge) => edge.id))

  change.createdNodeIds.push(
    ...[...afterNodes].filter((id) => !before.nodes.has(id))
  )
  change.deletedNodeIds.push(
    ...[...before.nodes].filter((id) => !afterNodes.has(id))
  )
  change.createdEdgeIds.push(
    ...[...afterEdges].filter((id) => !before.edges.has(id))
  )
  change.deletedEdgeIds.push(
    ...[...before.edges].filter((id) => !afterEdges.has(id))
  )
  return change
}

function snapshot() {
  const state = useCanvasStore.getState()
  return {
    nodes: new Set(state.nodes.map((node) => node.id)),
    edges: new Set(state.edges.map((edge) => edge.id))
  }
}

function originFor(node: CanvasNode): { x: number; y: number } {
  const state = useCanvasStore.getState()
  const base = absolutePosition(node, state.nodes)
  return { x: base.x + nodeSize(node).width + 48, y: base.y }
}

function markRunning(nodeId: string): void {
  useCanvasStore
    .getState()
    .patchNodeData(nodeId, { status: 'running', error: undefined })
}

function markFailed(nodeId: string, error: unknown): void {
  useCanvasStore.getState().patchNodeData(nodeId, {
    status: 'error',
    error: error instanceof Error ? error.message : String(error)
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function rectParam(
  params: Record<string, unknown>
): SubtitleRect | null {
  const value = params.rect
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const rect = value as Record<string, unknown>
  if (
    typeof rect.x !== 'number' ||
    typeof rect.y !== 'number' ||
    typeof rect.width !== 'number' ||
    typeof rect.height !== 'number'
  ) {
    return null
  }
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }
}

async function visionReady(): Promise<boolean> {
  try {
    const status = await window.api.components.status()
    return (
      status.find((item) => item.kind === 'depth-runtime')?.state ===
        'installed' &&
      status.find((item) => item.kind === 'vision-models')?.state ===
        'installed'
    )
  } catch {
    return false
  }
}

async function depthReady(): Promise<boolean> {
  try {
    const status = await window.api.components.status()
    return (
      status.find((item) => item.kind === 'depth-runtime')?.state ===
        'installed' &&
      status.find((item) => item.kind === 'depth-model')?.state ===
        'installed'
    )
  } catch {
    return false
  }
}

function needsVision(host?: NodeOperationUiHost): NodeOperationResult {
  if (host) {
    host.effect({
      type: 'settings',
      panel: 'components',
      message: '需要先安装「深度动作捕捉运行时」和「视觉模型（RVM + LaMa）」'
    })
    return { ok: false, needsUi: true, error: '需要安装视觉组件' }
  }
  return {
    ok: false,
    error: '需要先安装「深度动作捕捉运行时」和「视觉模型（RVM + LaMa）」'
  }
}

function openAiDialog(
  host: NodeOperationUiHost | undefined,
  op: NodeOperation,
  item: OperationMenuItem | undefined
): NodeOperationResult {
  const prompt = buildOperationPrompt(op, item)
  if (!host) {
    return {
      ok: false,
      needsGeneration: true,
      error: `《${item?.label ?? op.label}》需要选择生成模型，请用 generation_propose 并传入提示词`
    }
  }
  if (!prompt) {
    return { ok: false, error: `《${item?.label ?? op.label}》缺少提示词配置` }
  }
  host.effect({
    type: op.mask ? 'mask-dialog' : 'ai-dialog',
    op,
    ...(item ? { item } : {}),
    prompt
  })
  return { ok: true, result: { dialog: op.mask ? 'mask' : 'ai' } }
}

async function executeGridSplit(
  request: NodeOperationRequest,
  node: CanvasNode,
  item: OperationMenuItem | undefined,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  if (!item || item.id === 'custom') {
    return {
      ok: false,
      error:
        item?.id === 'custom'
          ? '自定义行列暂未开放'
          : '宫格切分需要选择 2×2 / 3×3 / 4×4 / 5×5'
    }
  }
  const [rows, cols] = item.id.split('x').map(Number)
  if (!rows || !cols) return { ok: false, error: '宫格行列无效' }

  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }

  host?.setRunning?.(true)
  consumeToast(host, `正在切分 ${rows} × ${cols}…`)

  const groupCount = useCanvasStore
    .getState()
    .nodes.filter(isGroupNode).length
  const pendingIds = useCanvasStore.getState().addPendingNodes(
    'image',
    originFor(node),
    rows * cols,
    `${node.data.title} · 切分`,
    node.id,
    {
      columns: cols,
      cellWidth: GRID_SPLIT_CELL_WIDTH,
      groupTitle: `宫格组 ${groupCount + 1}`,
      groupColor: 'green'
    }
  )

  try {
    const result = await window.api.media.splitGrid({
      path: output.path,
      rows,
      cols
    })
    const state = useCanvasStore.getState()
    result.assets.forEach((asset, index) => {
      const pendingId = pendingIds[index]
      if (pendingId) state.applyOutput(pendingId, asset, 'grid-split')
    })
    consumeToast(host, `已生成 ${result.assets.length} 个切分节点`)
    return {
      ok: true,
      result: {
        rowCount: rows,
        columnCount: cols,
        cellCount: result.assets.length,
        createdNodeIds: pendingIds
      }
    }
  } catch (error) {
    pendingIds.forEach((id) => markFailed(id, error))
    const message = errorMessage(error, '宫格切分失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

function consumeToast(
  host: NodeOperationUiHost | undefined,
  message: string,
  kind: 'info' | 'error' = 'info'
): void {
  host?.toast(message, kind)
}

async function executeCrop(
  request: NodeOperationRequest,
  node: CanvasNode,
  item: OperationMenuItem | undefined,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  const rect = rectParam(params)

  if (!item || item.id === 'free') {
    if (!rect) {
      if (!host) {
        return {
          ok: false,
          needsUi: true,
          error: '自由裁剪需要 params.rect'
        }
      }
      const probe =
        output.width && output.height
          ? { width: output.width, height: output.height }
          : await window.api.media.probe(output.path)
      if (!probe.width || !probe.height) {
        return { ok: false, error: '无法读取图片尺寸' }
      }
      host.effect({
        type: 'crop-dialog',
        path: output.path,
        ...(output.scope ? { scope: output.scope } : {}),
        width: probe.width,
        height: probe.height
      })
      return { ok: true, result: { dialog: 'crop' } }
    }
  }

  host?.setRunning?.(true)
  markRunning(node.id)
  consumeToast(host, rect ? '正在裁剪…' : `正在裁剪为 ${item?.label}…`)

  try {
    const result = rect
      ? await window.api.media.cropImageRect({ path: output.path, ...rect })
      : await window.api.media.cropImage({
          path: output.path,
          ratio: item?.id ?? '1:1'
        })
    useCanvasStore
      .getState()
      .applyOutput(node.id, result.asset, rect ? 'crop-free' : 'crop')
    consumeToast(
      host,
      `裁剪完成：${result.asset.width ?? 0} × ${result.asset.height ?? 0}`
    )
    return {
      ok: true,
      result: {
        outputId: result.asset.id,
        width: result.asset.width ?? null,
        height: result.asset.height ?? null
      }
    }
  } catch (error) {
    markFailed(node.id, error)
    const message = errorMessage(error, '裁剪失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

async function executeVideoCrop(
  request: NodeOperationRequest,
  node: CanvasNode,
  item: OperationMenuItem | undefined,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  if (!item) return { ok: false, error: '画面裁切需要选择比例' }
  if (item.id === 'source') {
    return { ok: false, error: '当前已是原比例，无需裁切' }
  }

  host?.setRunning?.(true)
  markRunning(node.id)
  consumeToast(host, `正在裁切为 ${item.label}…`)
  try {
    const result = await window.api.media.cropVideo({
      path: output.path,
      ratio: item.id
    })
    useCanvasStore.getState().applyOutput(node.id, result.asset, 'video-crop')
    consumeToast(
      host,
      `裁切完成：${result.asset.width ?? 0} × ${result.asset.height ?? 0}`
    )
    return {
      ok: true,
      result: {
        outputId: result.asset.id,
        width: result.asset.width ?? null,
        height: result.asset.height ?? null
      }
    }
  } catch (error) {
    markFailed(node.id, error)
    const message = errorMessage(error, '画面裁切失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

async function executeFrame(
  request: NodeOperationRequest,
  node: CanvasNode,
  item: OperationMenuItem | undefined,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  if (!item) return { ok: false, error: '抽帧需要选择首帧 / 尾帧 / 当前帧' }

  const time =
    item.id === 'current'
      ? typeof params.time === 'number'
        ? params.time
        : host?.getCurrentTime?.(node.id) ?? 0
      : undefined

  host?.setRunning?.(true)
  consumeToast(host, `正在截取${item.label}…`)
  const pendingId = useCanvasStore.getState().addPendingNodes(
    'image',
    originFor(node),
    1,
    `${node.data.title} · ${item.label}`,
    node.id
  )[0]

  try {
    const result = await window.api.media.extractFrame({
      path: output.path,
      mode: item.id as 'first' | 'last' | 'current',
      ...(time !== undefined ? { time } : {})
    })
    useCanvasStore
      .getState()
      .applyOutput(pendingId, result.asset, `frame-${item.id}`)
    consumeToast(host, `已生成${item.label}`)
    return {
      ok: true,
      result: {
        createdNodeId: pendingId,
        mode: item.id,
        outputId: result.asset.id
      }
    }
  } catch (error) {
    markFailed(pendingId, error)
    const message = errorMessage(error, '抽帧失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

async function executeSplitAv(
  request: NodeOperationRequest,
  node: CanvasNode,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }

  host?.setRunning?.(true)
  consumeToast(host, '正在分离音视频…')

  const state = useCanvasStore.getState()
  const origin = originFor(node)
  const pendingVideoId = state.addPendingNodes(
    'video',
    origin,
    1,
    `${node.data.title} · 无声`,
    node.id
  )[0]
  const pendingAudioId = state.addPendingNodes(
    'audio',
    { x: origin.x, y: origin.y + 420 },
    1,
    `${node.data.title} · 音轨`,
    node.id
  )[0]

  const groupCount = useCanvasStore
    .getState()
    .nodes.filter(isGroupNode).length
  const groupId = state.createGroupFromNodes(
    [pendingVideoId, pendingAudioId],
    {
      columns: 1,
      title: `音视频组 ${groupCount + 1}`,
      color: 'cyan'
    }
  )

  try {
    const result = await window.api.media.splitAv({ path: output.path })
    useCanvasStore
      .getState()
      .applyOutput(pendingVideoId, result.video, 'split-av-video')
    if (result.audio) {
      useCanvasStore
        .getState()
        .applyOutput(pendingAudioId, result.audio, 'split-av-audio')
    } else {
      markFailed(pendingAudioId, '当前视频无音轨')
    }
    consumeToast(
      host,
      result.audio ? '已生成无声视频和音轨节点' : '已生成无声视频节点'
    )
    return {
      ok: true,
      result: {
        videoNodeId: pendingVideoId,
        audioNodeId: result.audio ? pendingAudioId : null,
        groupId
      }
    }
  } catch (error) {
    markFailed(pendingVideoId, error)
    markFailed(pendingAudioId, error)
    const message = errorMessage(error, '分离音视频失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

async function executeTrim(
  request: NodeOperationRequest,
  node: CanvasNode,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }

  const start = typeof params.start === 'number' ? params.start : undefined
  const end = typeof params.end === 'number' ? params.end : undefined
  if (start === undefined || end === undefined) {
    if (!host) {
      return {
        ok: false,
        needsUi: true,
        error: '片段截取需要 params.start 和 params.end（秒）'
      }
    }
    const duration =
      output.duration && output.duration > 0
        ? output.duration
        : (await window.api.media.probe(output.path)).duration
    if (!duration) return { ok: false, error: '无法读取视频时长' }
    host.effect({ type: 'trim-dialog', duration })
    return { ok: true, result: { dialog: 'trim' } }
  }
  if (end <= start) {
    return { ok: false, error: '结束时间必须大于开始时间' }
  }

  host?.setRunning?.(true)
  markRunning(node.id)
  consumeToast(host, '正在截取…')
  try {
    const result = await window.api.media.trimVideo({
      path: output.path,
      start,
      end
    })
    useCanvasStore.getState().applyOutput(node.id, result.asset, 'trim')
    consumeToast(
      host,
      `截取完成：${(result.asset.duration ?? end - start).toFixed(1)} 秒`
    )
    return {
      ok: true,
      result: {
        outputId: result.asset.id,
        duration: result.asset.duration ?? end - start
      }
    }
  } catch (error) {
    markFailed(node.id, error)
    const message = errorMessage(error, '片段截取失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

async function executeFilmStudy(
  request: NodeOperationRequest,
  node: CanvasNode,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  if (node.type !== 'cine' || node.data.kind !== 'video') {
    return { ok: false, error: '逐帧拉片只支持视频节点' }
  }
  const interval =
    typeof params.interval === 'number' ? params.interval : 0
  const studyNodeId = createStudyNodeFromVideo(node.id, interval)
  if (!studyNodeId) {
    return { ok: false, error: '当前视频还没有可用的视频输出' }
  }

  consumeToast(
    host,
    interval > 0
      ? `已创建拉片节点，按 ${interval} 秒/镜拆分…`
      : '已创建拉片节点，正在自动拆解分镜…'
  )
  if (request.turnId) {
    await runFilmStudyAuto(studyNodeId, {
      interval,
      outputs: { storyboard: true, sheet: true }
    })
    const finished = findNode(studyNodeId)
    const studyId =
      finished?.type === 'cine'
        ? String(finished.data.studyId ?? '')
        : ''
    if (!studyId) {
      return {
        ok: false,
        error:
          finished?.type === 'cine'
            ? String(finished.data.error ?? '拉片没有返回结果')
            : '拉片节点已不存在'
      }
    }
  } else {
    void runFilmStudyAuto(studyNodeId, {
      interval,
      outputs: { storyboard: true, sheet: true }
    })
  }
  return {
    ok: true,
    result: { studyNodeId }
  }
}

async function executeMotionCapture(
  request: NodeOperationRequest,
  node: CanvasNode,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }

  const quality =
    params.quality === 'standard' || params.quality === 'long'
      ? params.quality
      : 'fast'
  const fps = typeof params.fps === 'number' ? params.fps : 0
  const explicit = typeof params.quality === 'string' || typeof params.fps === 'number'

  if (!explicit && host) {
    if (!(await depthReady())) {
      host.effect({
        type: 'settings',
        panel: 'components',
        message:
          '「深度动作捕捉」需要「深度动作捕捉运行时」和「Video Depth Anything Small 模型」'
      })
      return { ok: false, needsUi: true, error: '需要安装深度组件' }
    }
    const probe = await window.api.media.probe(output.path)
    if (!probe.duration) {
      return { ok: false, error: '无法读取视频时长' }
    }
    host.effect({ type: 'depth-dialog', duration: probe.duration })
    return { ok: true, result: { dialog: 'depth' } }
  }

  if (!(await depthReady())) {
    if (host) {
      host.effect({
        type: 'settings',
        panel: 'components',
        message: '需要先安装「深度动作捕捉运行时」和「Video Depth Anything Small 模型」'
      })
      return { ok: false, error: '需要安装深度组件' }
    }
    return {
      ok: false,
      error: '需要先安装「深度动作捕捉运行时」和「Video Depth Anything Small 模型」'
    }
  }

  const pendingId = useCanvasStore.getState().addPendingNodes(
    'video',
    originFor(node),
    1,
    `${node.data.title} · 深度`,
    node.id
  )[0]
  try {
    const { taskId } = await window.api.media.startDepthCapture({
      path: output.path,
      quality,
      ...(fps > 0 ? { fps } : {})
    })
    trackDepthTask(taskId, {
      nodeId: node.id,
      pendingNodeId: pendingId,
      title: String(node.data.title ?? '')
    })
    consumeToast(host, '已开始深度动作捕捉，完成后自动写入节点')
    return {
      ok: true,
      result: { taskId, pendingNodeId: pendingId, quality, fps }
    }
  } catch (error) {
    markFailed(pendingId, error)
    const message = errorMessage(error, '深度动作捕捉启动失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  }
}

async function executeSubtitle(
  request: NodeOperationRequest,
  node: CanvasNode,
  item: OperationMenuItem | undefined,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  if (!item) return { ok: false, error: '去字幕需要选择智能或框选' }

  const title =
    typeof params.title === 'string' && params.title.trim()
      ? params.title.trim()
      : item.id === 'box'
        ? '框选去字幕'
        : '智能去字幕'
  let rect = rectParam(params)

  if (item.id === 'box' && !rect) {
    if (!host) {
      return {
        ok: false,
        needsUi: true,
        error: '框选去字幕需要 params.rect'
      }
    }
    host.effect({
      type: 'subtitle-dialog',
      mode: 'delogo',
      title,
      path: output.path,
      ...(output.scope ? { scope: output.scope } : {}),
      ...(output.width ? { width: output.width } : {}),
      ...(output.height ? { height: output.height } : {})
    })
    return { ok: true, result: { dialog: 'subtitle-box' } }
  }

  if (item.id === 'smart') {
    if (!(await visionReady())) return needsVision(host)
    if (!rect) {
      const detected = await window.api.media
        .detectSubtitleRect(output.path, output.scope)
        .catch(() => null)
      if (!detected) {
        if (!host) {
          return {
            ok: false,
            error: '未检测到字幕区域，请改用 itemId=box 并提供 rect'
          }
        }
        host.effect({
          type: 'subtitle-dialog',
          mode: 'vision',
          title,
          path: output.path,
          ...(output.scope ? { scope: output.scope } : {}),
          ...(output.width ? { width: output.width } : {}),
          ...(output.height ? { height: output.height } : {})
        })
        return { ok: true, result: { dialog: 'subtitle-vision' } }
      }
      rect = detected
    }

    const pendingId = useCanvasStore.getState().addPendingNodes(
      'video',
      originFor(node),
      1,
      `${node.data.title} · ${title}`,
      node.id
    )[0]
    try {
      const { taskId } = await window.api.media.startVisionTask({
        kind: 'repair-video',
        path: output.path,
        ...(output.scope ? { scope: output.scope } : {}),
        rect
      })
      trackVisionTask(taskId, {
        mode: 'pending',
        nodeId: node.id,
        pendingIds: [pendingId],
        op: title,
        title
      })
      consumeToast(host, `已开始${title}，完成后自动写入节点`)
      return { ok: true, result: { taskId, pendingNodeId: pendingId } }
    } catch (error) {
      markFailed(pendingId, error)
      const message = errorMessage(error, `${title}失败`)
      host?.toast(message, 'error')
      return { ok: false, error: message }
    }
  }

  if (!rect) return { ok: false, error: '缺少字幕区域 rect' }
  host?.setRunning?.(true)
  markRunning(node.id)
  consumeToast(host, '正在框选去字幕…')
  try {
    const result = await window.api.media.removeSubtitles({
      path: output.path,
      ...rect
    })
    useCanvasStore.getState().applyOutput(node.id, result.asset, 'subtitle-box')
    consumeToast(host, '去字幕完成')
    return { ok: true, result: { outputId: result.asset.id } }
  } catch (error) {
    markFailed(node.id, error)
    const message = errorMessage(error, '去字幕失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  } finally {
    host?.setRunning?.(false)
  }
}

async function executeLayerSplit(
  request: NodeOperationRequest,
  node: CanvasNode,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  if (!(await visionReady())) return needsVision(host)

  const pendingIds = useCanvasStore.getState().addPendingNodes(
    'image',
    originFor(node),
    2,
    `${node.data.title} · 图层`,
    node.id
  )
  try {
    const { taskId } = await window.api.media.startVisionTask({
      kind: 'layer-split',
      path: output.path,
      ...(output.scope ? { scope: output.scope } : {})
    })
    trackVisionTask(taskId, {
      mode: 'pending',
      nodeId: node.id,
      pendingIds,
      op: 'layer-split',
      title: '图层分离'
    })
    consumeToast(host, '已开始图层分离，完成后自动写入节点')
    return { ok: true, result: { taskId, createdNodeIds: pendingIds } }
  } catch (error) {
    pendingIds.forEach((id) => markFailed(id, error))
    const message = errorMessage(error, '图层分离失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  }
}

async function executeMatting(
  request: NodeOperationRequest,
  node: CanvasNode,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  if (!(await visionReady())) return needsVision(host)

  const pendingId = useCanvasStore.getState().addPendingNodes(
    'video',
    originFor(node),
    1,
    `${node.data.title} · 抠像`,
    node.id
  )[0]
  try {
    const { taskId } = await window.api.media.startVisionTask({
      kind: 'matte-video',
      path: output.path,
      ...(output.scope ? { scope: output.scope } : {})
    })
    trackVisionTask(taskId, {
      mode: 'pending',
      nodeId: node.id,
      pendingIds: [pendingId],
      op: 'matting',
      title: '视频抠像'
    })
    consumeToast(host, '已开始视频抠像，完成后自动写入节点')
    return { ok: true, result: { taskId, createdNodeId: pendingId } }
  } catch (error) {
    markFailed(pendingId, error)
    const message = errorMessage(error, '视频抠像失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  }
}

async function executeObjectRemove(
  request: NodeOperationRequest,
  node: CanvasNode,
  params: Record<string, unknown>,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }
  const rect = rectParam(params)
  if (!rect) {
    if (!host) {
      return {
        ok: false,
        needsUi: true,
        error: '主体消除需要 params.rect'
      }
    }
    if (!(await visionReady())) return needsVision(host)
    host.effect({
      type: 'subtitle-dialog',
      mode: 'vision',
      title: '主体消除',
      path: output.path,
      ...(output.scope ? { scope: output.scope } : {}),
      ...(output.width ? { width: output.width } : {}),
      ...(output.height ? { height: output.height } : {})
    })
    return { ok: true, result: { dialog: 'object-remove' } }
  }
  if (!(await visionReady())) return needsVision(host)

  const pendingId = useCanvasStore.getState().addPendingNodes(
    'video',
    originFor(node),
    1,
    `${node.data.title} · 主体消除`,
    node.id
  )[0]
  try {
    const { taskId } = await window.api.media.startVisionTask({
      kind: 'repair-video',
      path: output.path,
      ...(output.scope ? { scope: output.scope } : {}),
      rect
    })
    trackVisionTask(taskId, {
      mode: 'pending',
      nodeId: node.id,
      pendingIds: [pendingId],
      op: '主体消除',
      title: '主体消除'
    })
    consumeToast(host, '已开始主体消除，完成后自动写入节点')
    return { ok: true, result: { taskId, createdNodeId: pendingId } }
  } catch (error) {
    markFailed(pendingId, error)
    const message = errorMessage(error, '主体消除失败')
    host?.toast(message, 'error')
    return { ok: false, error: message }
  }
}

async function executeOutpaintOrCutout(
  request: NodeOperationRequest,
  node: CanvasNode,
  op: NodeOperation,
  item: OperationMenuItem | undefined,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const output = selectedNodeOutput(node)
  if (!output) return { ok: false, error: '节点还没有可用输出' }

  if (!(await visionReady())) {
    return openAiDialog(host, op, item)
  }

  const params =
    op.id === 'outpaint'
      ? {
          kind: 'outpaint-image' as const,
          path: output.path,
          ...(output.scope ? { scope: output.scope } : {}),
          ratio: (item?.id ?? '16:9') as
            | '16:9'
            | '9:16'
            | '1:1'
            | '4:3'
            | '3:4'
            | '21:9'
        }
      : {
          kind: 'matte-image' as const,
          path: output.path,
          ...(output.scope ? { scope: output.scope } : {})
        }

  try {
    const { taskId } = await window.api.media.startVisionTask(params)
    trackVisionTask(taskId, {
      mode: 'apply',
      nodeId: node.id,
      pendingIds: [],
      op: op.id,
      title: op.label
    })
    consumeToast(host, `已开始${op.label}`)
    return { ok: true, result: { taskId } }
  } catch (error) {
    const message = errorMessage(error, `${op.label}失败`)
    host?.toast(message, 'error')
    return { ok: false, error: message }
  }
}

export async function executeNodeOperation(
  request: NodeOperationRequest,
  host?: NodeOperationUiHost
): Promise<NodeOperationResult> {
  const node = findNode(request.nodeId)
  if (!node || node.type !== 'cine') {
    return { ok: false, error: '找不到这个画布节点' }
  }
  const op = operationsForKind(node.data.kind as NodeKind).find(
    (entry) => entry.id === request.operationId
  )
  if (!op) {
    return { ok: false, error: `当前节点不支持操作：${request.operationId}` }
  }

  const ctx = operationContext(node)
  const disabled = op.disabledReason?.(ctx) ?? null
  if (disabled) return { ok: false, error: disabled }
  if (!op.implemented) {
    return {
      ok: false,
      error: op.requires
        ? `${op.label}：${op.requires.label}`
        : `${op.label}暂不可用`
    }
  }

  const item = request.itemId
    ? op.menu?.find((entry) => entry.id === request.itemId)
    : undefined
  if (request.itemId && !item) {
    return { ok: false, error: `操作 ${op.id} 不支持 itemId=${request.itemId}` }
  }

  const spec = nodeOperationAgentSpec(op.id)
  const params = request.params ?? {}
  if (!host) {
    const paramError = validateNodeOperationParams(
      op.id,
      request.itemId,
      params
    )
    if (paramError) return { ok: false, error: paramError }
    if (spec && !spec.executable) {
      return {
        ok: false,
        needsGeneration: true,
        error: spec.reason ?? `${op.label}需要界面交互`
      }
    }
  }

  const before = snapshot()
  if (request.turnId) {
    useCanvasStore.getState().beginToolTurn(request.turnId)
  }

  try {
    let result: NodeOperationResult

    if (item?.disabled) {
      return { ok: false, error: `${item.label}暂不可用` }
    }

    if (op.id === 'grid-split') {
      result = await executeGridSplit(request, node, item, host)
    } else if (op.id === 'crop') {
      result = await executeCrop(request, node, item, params, host)
    } else if (op.id === 'video-crop') {
      result = await executeVideoCrop(request, node, item, host)
    } else if (op.id === 'frame-study') {
      result = await executeFrame(request, node, item, params, host)
    } else if (op.id === 'split-av') {
      result = await executeSplitAv(request, node, host)
    } else if (op.id === 'clip-trim') {
      result = await executeTrim(request, node, params, host)
    } else if (op.id === 'film-study') {
      result = await executeFilmStudy(request, node, params, host)
    } else if (op.id === 'motion-capture') {
      result = await executeMotionCapture(request, node, params, host)
    } else if (op.id === 'subtitle') {
      result = await executeSubtitle(request, node, item, params, host)
    } else if (op.id === 'layer-split') {
      result = await executeLayerSplit(request, node, host)
    } else if (op.id === 'matting') {
      result = await executeMatting(request, node, host)
    } else if (op.id === 'object-remove') {
      result = await executeObjectRemove(request, node, params, host)
    } else if (op.id === 'outpaint' || op.id === 'cutout') {
      result = await executeOutpaintOrCutout(request, node, op, item, host)
    } else if (isVideoOperation(op.id)) {
      const id = useCanvasStore
        .getState()
        .addVideoOpNode(node.id, op.id as VideoOperationId)
      result = {
        ok: true,
        result: { videoOpNodeId: id }
      }
    } else if (op.id === 'relight' && item?.id === 'custom' && host) {
      host.effect({ type: 'sphere-dialog', kind: 'light' })
      result = { ok: true, result: { dialog: 'sphere-light' } }
    } else if (op.id === 'multi-angle' && item?.id === 'custom' && host) {
      host.effect({ type: 'sphere-dialog', kind: 'camera' })
      result = { ok: true, result: { dialog: 'sphere-camera' } }
    } else if (!host) {
      result = {
        ok: false,
        needsGeneration: true,
        error: `${op.label}需要选择生成模型，请用 generation_propose`
      }
    } else {
      result = openAiDialog(host, op, item)
    }

    if (result.ok) {
      const change = trackTurn(request, before)
      if (result.result && typeof result.result === 'object') {
        const created = (result.result as { createdNodeIds?: unknown })
          .createdNodeIds
        if (Array.isArray(created)) {
          change.createdNodeIds.push(
            ...created.filter(
              (id): id is string =>
                typeof id === 'string' && !change.createdNodeIds.includes(id)
            )
          )
        }
      }
      result.change = change
    }
    return result
  } finally {
    if (request.turnId) {
      useCanvasStore.getState().endToolTurn()
    }
  }
}

export function operationNeedsConfirm(operationId: string): boolean {
  return nodeOperationAgentSpec(operationId)?.requiresConfirm === true
}
