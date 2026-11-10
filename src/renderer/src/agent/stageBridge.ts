import type { AgentToolCallRequest } from '@shared/agent'
import {
  applyStageCommands,
  type StageCommand
} from '@shared/stage-commands'
import type {
  DirectorStageDoc,
  StageAspect,
  StageCamera,
  StageObject,
  StageObjectType,
  StageTransform,
  StageVec3
} from '@shared/stage-schema'
import { isStageNode, useCanvasStore } from '../stores/canvas'
import {
  syncStageNodeSummary,
  useStageStore
} from '../stage/stageStore'

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
  commands: StageCommand[]
): Promise<DirectorStageDoc> {
  const store = useStageStore.getState()
  if (store.open && store.nodeId === nodeId && store.doc) {
    if (!store.applyCommands(commands)) {
      throw new Error(useStageStore.getState().error ?? '场景命令执行失败')
    }
    const doc = useStageStore.getState().doc
    if (!doc) throw new Error('场景未加载')
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

    const updated = await applyToStage(nodeId, [{ type: 'addObject', object }])
    return {
      ok: true,
      result: {
        objectId: object.id,
        stageId: updated.stageId,
        object: objectSummary(object),
        objectCount: updated.objects.length
      }
    }
  }

  if (call.name === 'stage_transform_object') {
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

    const updated = await applyToStage(nodeId, [
      { type: 'transformObject', objectId, transform }
    ])
    const object = updated.objects.find((item) => item.id === objectId)
    return {
      ok: true,
      result: {
        objectId,
        transform: object?.transform ?? null
      }
    }
  }

  if (call.name === 'stage_add_camera') {
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

    const updated = await applyToStage(nodeId, [
      { type: 'addCamera', camera }
    ])
    return {
      ok: true,
      result: {
        cameraId: camera.id,
        camera,
        activeCameraId: updated.activeCameraId ?? null,
        cameraCount: updated.cameras.length
      }
    }
  }

  if (call.name === 'stage_set_active_camera') {
    const cameraId = String(call.args.cameraId ?? '')
    const updated = await applyToStage(nodeId, [
      { type: 'setActiveCamera', cameraId }
    ])
    return {
      ok: true,
      result: {
        activeCameraId: updated.activeCameraId ?? null
      }
    }
  }

  if (call.name === 'stage_remove_object') {
    const objectId = String(call.args.objectId ?? '')
    const updated = await applyToStage(nodeId, [
      { type: 'removeObject', objectId }
    ])
    return {
      ok: true,
      result: {
        objectId,
        objectCount: updated.objects.length
      }
    }
  }

  return { ok: false, error: `未实现的导演台工具：${call.name}` }
}
