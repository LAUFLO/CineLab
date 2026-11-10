import type {
  AgentToolCallRequest,
  AgentTurnChange
} from '@shared/agent'
import {
  applyStageCommands,
  type StageCommand
} from '@shared/stage-commands'
import type {
  CameraKeyframe,
  DirectorStageDoc,
  StageAspect,
  StageBackground,
  StageCamera,
  StageObject,
  StageObjectType,
  StageShot,
  StageTransform,
  StageVec3
} from '@shared/stage-schema'
import {
  isStageNode,
  useCanvasStore
} from '../stores/canvas'
import {
  syncStageNodeSummary,
  useStageStore
} from '../stage/stageStore'
import { exportStagePreviewToCanvas } from '../stage/preview-runner'

const OBJECT_LABEL: Record<StageObjectType, string> = {
  human: '人物',
  box: '立方体',
  sphere: '球体',
  plane: '平面',
  gltf: '模型',
  crowd: '群众'
}

export interface StageToolResult {
  ok: boolean
  result?: unknown
  error?: string
  change?: AgentTurnChange
}

function stageChange(): AgentTurnChange {
  return {
    createdNodeIds: [],
    updatedNodeIds: [],
    deletedNodeIds: [],
    createdEdgeIds: [],
    deletedEdgeIds: [],
    previousTitles: {},
    previousPositions: {},
    stageUpdated: true
  }
}

function stageNode(nodeId: string) {
  const node = useCanvasStore
    .getState()
    .nodes.find((item) => item.id === nodeId)
  if (!node || !isStageNode(node)) {
    throw new Error('找不到导演台节点')
  }
  return node
}

function readVec(value: unknown, fallback: StageVec3): StageVec3 {
  if (value === undefined) return fallback
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (item) => typeof item === 'number' && Number.isFinite(item)
    )
  ) {
    throw new Error('坐标必须是 3 个有限数字')
  }
  return [value[0], value[1], value[2]]
}

async function readDoc(
  nodeId: string
): Promise<{ doc: DirectorStageDoc; live: boolean }> {
  const store = useStageStore.getState()
  if (store.open && store.nodeId === nodeId && store.doc) {
    return { doc: store.doc, live: true }
  }

  const node = stageNode(nodeId)
  const doc = await window.api.stage.load(node.data.stageId)
  if (!doc) throw new Error('场景文件不存在')
  return { doc, live: false }
}

async function applyToStage(
  nodeId: string,
  commands: StageCommand[],
  turnId?: string
): Promise<DirectorStageDoc> {
  const store = useStageStore.getState()
  if (store.open && store.nodeId === nodeId && store.doc) {
    const previous = store.doc
    if (!store.applyCommands(commands, turnId)) {
      throw new Error(useStageStore.getState().error ?? '场景命令执行失败')
    }
    const doc = useStageStore.getState().doc
    if (!doc) throw new Error('场景未加载')
    if (doc === previous) {
      throw new Error('场景命令没有产生修改')
    }
    // 工具执行必须立即落盘，不能只依赖窗口的防抖保存
    await window.api.stage.save(doc)
    useStageStore.setState({ dirty: false })
    syncStageNodeSummary(nodeId, doc)
    return doc
  }

  const node = stageNode(nodeId)
  const doc = await window.api.stage.load(node.data.stageId)
  if (!doc) throw new Error('场景文件不存在')
  const result = applyStageCommands(doc, commands)
  if (!result.ok) throw new Error(result.error ?? '场景命令执行失败')
  await window.api.stage.save(result.doc)
  syncStageNodeSummary(nodeId, result.doc)
  return result.doc
}

/** Agent 写场景前自动打开导演台，保证修改可见且进入场景撤销历史 */
async function ensureStageOpen(nodeId: string): Promise<void> {
  const store = useStageStore.getState()
  if (store.open && store.nodeId === nodeId && store.doc) return
  await useStageStore.getState().openStage(nodeId)
  const next = useStageStore.getState()
  if (!next.open || next.nodeId !== nodeId || !next.doc) {
    throw new Error(next.error ?? '打开导演台场景失败')
  }
}

function objectSummary(object: StageObject): Record<string, unknown> {
  return {
    id: object.id,
    type: object.type,
    name: object.name,
    transform: object.transform,
    ...(object.pose ? { pose: object.pose } : {}),
    ...(object.color ? { color: object.color } : {}),
    ...(object.visible !== undefined ? { visible: object.visible } : {}),
    ...(object.count ? { count: object.count } : {})
  }
}

function stageSummary(doc: DirectorStageDoc): Record<string, unknown> {
  return {
    stageId: doc.stageId,
    name: doc.name,
    activeCameraId: doc.activeCameraId ?? null,
    objects: doc.objects
      .slice(0, 120)
      .map((object) => objectSummary(object)),
    cameras: doc.cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      position: camera.position,
      target: camera.target,
      fov: camera.fov,
      ...(camera.aspect ? { aspect: camera.aspect } : {})
    })),
    shots: doc.shots.map((shot) => ({
      id: shot.id,
      name: shot.name ?? null,
      cameraId: shot.cameraId,
      durationMs: shot.durationMs,
      aspect: shot.aspect,
      cameraKeyframes: shot.cameraTrack?.length ?? 0,
      actionTracks: shot.actionTracks?.length ?? 0
    }))
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

export async function executeStageTool(
  call: AgentToolCallRequest
): Promise<StageToolResult> {
  const nodeId = String(call.args.nodeId ?? '')

  if (call.name === 'stage_get') {
    const { doc } = await readDoc(nodeId)
    return { ok: true, result: stageSummary(doc) }
  }

  if (call.name === 'stage_add_object') {
    await ensureStageOpen(nodeId)
    const type = String(call.args.type ?? '') as StageObjectType
    const { doc } = await readDoc(nodeId)
    const countOfType = doc.objects.filter(
      (object) => object.type === type
    ).length
    const name =
      typeof call.args.name === 'string' && call.args.name.trim()
        ? call.args.name.trim()
        : `${OBJECT_LABEL[type] ?? type} ${countOfType + 1}`

    const object: StageObject = {
      id: generateId('object'),
      type,
      name,
      transform: {
        position: readVec(call.args.position, [0, 0, 0]),
        rotation: readVec(call.args.rotation, [0, 0, 0]),
        scale: readVec(call.args.scale, [1, 1, 1])
      },
      ...(typeof call.args.pose === 'string' && call.args.pose.trim()
        ? { pose: call.args.pose.trim() }
        : {}),
      ...(typeof call.args.color === 'string' && call.args.color.trim()
        ? { color: call.args.color.trim() }
        : {}),
      ...(type === 'crowd' && typeof call.args.count === 'number'
        ? { count: call.args.count }
        : {})
    }

    const updated = await applyToStage(
      nodeId,
      [{ type: 'addObject', object }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        objectId: object.id,
        stageId: updated.stageId,
        object: objectSummary(object),
        objectCount: updated.objects.length
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_transform_object') {
    await ensureStageOpen(nodeId)
    const objectId = String(call.args.objectId ?? '')
    const transform: Partial<StageTransform> = {}
    if (call.args.position !== undefined) {
      transform.position = readVec(call.args.position, [0, 0, 0])
    }
    if (call.args.rotation !== undefined) {
      transform.rotation = readVec(call.args.rotation, [0, 0, 0])
    }
    if (call.args.scale !== undefined) {
      transform.scale = readVec(call.args.scale, [1, 1, 1])
    }

    const updated = await applyToStage(
      nodeId,
      [{ type: 'transformObject', objectId, transform }],
      call.turnId
    )
    const object = updated.objects.find((item) => item.id === objectId)
    return {
      ok: true,
      result: {
        objectId,
        transform: object?.transform ?? null
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_add_camera') {
    await ensureStageOpen(nodeId)
    const { doc } = await readDoc(nodeId)
    const aspect =
      typeof call.args.aspect === 'string'
        ? (call.args.aspect as StageAspect)
        : undefined
    const camera: StageCamera = {
      id: generateId('camera'),
      name:
        typeof call.args.name === 'string' && call.args.name.trim()
          ? call.args.name.trim()
          : `机位 ${doc.cameras.length + 1}`,
      position: readVec(call.args.position, [5, 2.4, 6]),
      target: readVec(call.args.target, [0, 1, 0]),
      fov: typeof call.args.fov === 'number' ? call.args.fov : 50,
      ...(aspect ? { aspect } : {})
    }

    const updated = await applyToStage(
      nodeId,
      [{ type: 'addCamera', camera }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        cameraId: camera.id,
        camera,
        activeCameraId: updated.activeCameraId ?? null,
        cameraCount: updated.cameras.length
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_transform_camera') {
    await ensureStageOpen(nodeId)
    const cameraId = String(call.args.cameraId ?? '')
    const patch: Partial<Omit<StageCamera, 'id'>> = {}
    if (typeof call.args.name === 'string') {
      patch.name = call.args.name.trim()
    }
    if (call.args.position !== undefined) {
      patch.position = readVec(call.args.position, [0, 0, 0])
    }
    if (call.args.target !== undefined) {
      patch.target = readVec(call.args.target, [0, 0, 0])
    }
    if (typeof call.args.fov === 'number') {
      patch.fov = call.args.fov
    }
    if (typeof call.args.aspect === 'string') {
      patch.aspect = call.args.aspect as StageAspect
    }

    const updated = await applyToStage(
      nodeId,
      [{ type: 'updateCamera', cameraId, patch }],
      call.turnId
    )
    const camera = updated.cameras.find((item) => item.id === cameraId)
    if (!camera) throw new Error('找不到这个机位')
    return {
      ok: true,
      result: {
        cameraId,
        camera: {
          id: camera.id,
          name: camera.name,
          position: camera.position,
          target: camera.target,
          fov: camera.fov,
          ...(camera.aspect ? { aspect: camera.aspect } : {})
        }
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_set_active_camera') {
    await ensureStageOpen(nodeId)
    const cameraId = String(call.args.cameraId ?? '')
    const updated = await applyToStage(
      nodeId,
      [{ type: 'setActiveCamera', cameraId }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        activeCameraId: updated.activeCameraId ?? null
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_remove_object') {
    await ensureStageOpen(nodeId)
    const objectId = String(call.args.objectId ?? '')
    const updated = await applyToStage(
      nodeId,
      [{ type: 'removeObject', objectId }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        objectId,
        objectCount: updated.objects.length
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_add_shot') {
    await ensureStageOpen(nodeId)
    const { doc } = await readDoc(nodeId)
    const cameraId = String(call.args.cameraId ?? '')
    const durationMs = Number(call.args.durationMs)
    const aspect = call.args.aspect as StageAspect
    const shot: StageShot = {
      id: generateId('shot'),
      ...(typeof call.args.name === 'string' && call.args.name.trim()
        ? { name: call.args.name.trim() }
        : { name: `镜头 ${doc.shots.length + 1}` }),
      cameraId,
      durationMs,
      aspect
    }
    const updated = await applyToStage(
      nodeId,
      [{ type: 'addShot', shot }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        shotId: shot.id,
        shot,
        shotCount: updated.shots.length
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_update_shot') {
    await ensureStageOpen(nodeId)
    const shotId = String(call.args.shotId ?? '')
    const patch: Partial<Omit<StageShot, 'id'>> = {}
    if (typeof call.args.name === 'string') patch.name = call.args.name.trim()
    if (typeof call.args.cameraId === 'string') {
      patch.cameraId = call.args.cameraId.trim()
    }
    if (typeof call.args.durationMs === 'number') {
      patch.durationMs = call.args.durationMs
    }
    if (typeof call.args.aspect === 'string') {
      patch.aspect = call.args.aspect as StageAspect
    }
    const updated = await applyToStage(
      nodeId,
      [{ type: 'updateShot', shotId, patch }],
      call.turnId
    )
    const shot = updated.shots.find((item) => item.id === shotId)
    return {
      ok: true,
      result: {
        shotId,
        shot: shot
          ? {
              id: shot.id,
              name: shot.name ?? null,
              cameraId: shot.cameraId,
              durationMs: shot.durationMs,
              aspect: shot.aspect,
              cameraKeyframes: shot.cameraTrack?.length ?? 0
            }
          : null
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_remove_shot') {
    await ensureStageOpen(nodeId)
    const shotId = String(call.args.shotId ?? '')
    const updated = await applyToStage(
      nodeId,
      [{ type: 'removeShot', shotId }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        shotId,
        shotCount: updated.shots.length
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_set_camera_track') {
    await ensureStageOpen(nodeId)
    const shotId = String(call.args.shotId ?? '')
    const raw = Array.isArray(call.args.keyframes)
      ? call.args.keyframes
      : []
    const keyframes: CameraKeyframe[] = raw.map((frame) => {
      const item =
        frame && typeof frame === 'object'
          ? (frame as Record<string, unknown>)
          : {}
      return {
        timeMs: Number(item.timeMs),
        position: readVec(item.position, [0, 0, 0]),
        target: readVec(item.target, [0, 0, 0]),
        fov: Number(item.fov),
        ...(typeof item.easing === 'string'
          ? { easing: item.easing as CameraKeyframe['easing'] }
          : {})
      }
    })
    const updated = await applyToStage(
      nodeId,
      [{ type: 'setCameraTrack', shotId, track: keyframes }],
      call.turnId
    )
    const shot = updated.shots.find((item) => item.id === shotId)
    return {
      ok: true,
      result: {
        shotId,
        keyframeCount: shot?.cameraTrack?.length ?? keyframes.length
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_set_background') {
    await ensureStageOpen(nodeId)
    const background: StageBackground = {
      kind: String(call.args.kind) as StageBackground['kind'],
      value: String(call.args.value ?? '').trim()
    }
    const updated = await applyToStage(
      nodeId,
      [{ type: 'setBackground', background }],
      call.turnId
    )
    return {
      ok: true,
      result: { background: updated.background },
      change: stageChange()
    }
  }

  if (call.name === 'stage_update_object') {
    await ensureStageOpen(nodeId)
    const objectId = String(call.args.objectId ?? '')
    const commands: StageCommand[] = []
    if (typeof call.args.pose === 'string') {
      commands.push({ type: 'setPose', objectId, pose: call.args.pose })
    }
    if (typeof call.args.color === 'string') {
      commands.push({ type: 'setColor', objectId, color: call.args.color })
    }
    if (typeof call.args.visible === 'boolean') {
      commands.push({
        type: 'setVisible',
        objectId,
        visible: call.args.visible
      })
    }
    if (commands.length === 0) {
      return { ok: false, error: '没有可修改的对象属性' }
    }
    const updated = await applyToStage(nodeId, commands, call.turnId)
    const object = updated.objects.find((item) => item.id === objectId)
    if (!object) throw new Error('找不到这个对象')
    return {
      ok: true,
      result: {
        objectId,
        object: objectSummary(object)
      },
      change: stageChange()
    }
  }

  if (call.name === 'stage_export_preview') {
    const shotId = String(call.args.shotId ?? '')
    const { doc } = await readDoc(nodeId)
    if (!doc.shots.some((shot) => shot.id === shotId)) {
      return { ok: false, error: '找不到这个镜头' }
    }
    const stageNodeEntry = stageNode(nodeId)
    const resolution =
      call.args.resolution === '1080p' ? '1080p' : '720p'
    const fps = call.args.fps === 30 ? 30 : 24

    const result = await exportStagePreviewToCanvas({
      stageNodeId: stageNodeEntry.id,
      stageId: doc.stageId,
      shotId,
      resolution,
      fps,
      turnId: call.turnId
    })

    const change = stageChange()
    change.createdNodeIds.push(...result.nodeIds)
    return {
      ok: true,
      result: {
        path: result.path,
        nodeId: result.nodeIds[0] ?? null,
        width: result.asset.width ?? null,
        height: result.asset.height ?? null
      },
      change
    }
  }

  return { ok: false, error: `未实现的导演台工具：${call.name}` }
}
