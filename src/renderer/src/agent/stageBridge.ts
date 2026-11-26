import type { AgentToolCallRequest, AgentTurnChange } from '@shared/agent'
import { applyStageCommands, type StageCommand } from '@shared/stage-commands'
import type {
  ActionKeyframe,
  ActionTrack,
  CameraKeyframe,
  DirectorStageDoc,
  StageAspect,
  StageBackground,
  StageCamera,
  StageEasing,
  StageObject,
  StageObjectType,
  StageShot,
  StageShotIntent,
  StageTransform,
  StageVec3
} from '@shared/stage-schema'
import { solveStageShotIntent } from '@shared/stage-shot-intent'
import { buildAutoCoverage } from '@shared/stage-auto-coverage'
import { buildDialogueCoverage, parseDialogue } from '@shared/stage-dialogue'
import { isStageNode, nodeSize, useCanvasStore } from '../stores/canvas'
import { syncStageNodeSummary, useStageStore } from '../stage/stageStore'
import { exportStagePreviewToCanvas } from '../stage/preview-runner'
import { generateStageFromScene } from '../stage/stage-from-scene'
import { useUIStore } from '../stores/ui'

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
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
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
    objectCount: doc.objects.length,
    cameraCount: doc.cameras.length,
    shotCount: doc.shots.length,
    objects: doc.objects.slice(0, 120).map((object) => objectSummary(object)),
    cameras: doc.cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      position: camera.position,
      target: camera.target,
      fov: camera.fov,
      ...(camera.aspect ? { aspect: camera.aspect } : {})
    })),
    background: doc.background,
    shots: doc.shots.map((shot) => ({
      id: shot.id,
      name: shot.name ?? null,
      cameraId: shot.cameraId,
      durationMs: shot.durationMs,
      aspect: shot.aspect,
      source: shot.source ?? 'manual',
      caption: shot.caption ?? null,
      intent: shot.intent ?? null,
      cameraKeyframeCount: shot.cameraTrack?.length ?? 0,
      actionTrackCount: shot.actionTracks?.length ?? 0,
      cameraTrack: shot.cameraTrack ?? [],
      actionTracks: shot.actionTracks ?? []
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

  const handlers: Record<
    string,
    (call: AgentToolCallRequest) => Promise<StageToolResult>
  > = {
    stage_capture: async (call) => {

      const nodeId = String(call.args.nodeId ?? '')

      const { doc } = await readDoc(nodeId)

      await ensureStageOpen(nodeId)

      const dataUrl = useStageStore.getState().capture()

      if (!dataUrl) {

        return { ok: false, error: '当前视口还没有准备好' }

      }


      const asset = await window.api.stage.capture({

        stageId: doc.stageId,

        dataUrl

      })

      const canvas = useCanvasStore.getState()

      const stageNode = canvas.nodes.find((node) => node.id === nodeId)

      if (!stageNode || !isStageNode(stageNode)) {

        return { ok: false, error: '找不到这个导演台节点' }

      }


      const size = nodeSize(stageNode)

      const ids = canvas.addAssetNodes(

        'image',

        {

          x: stageNode.position.x + size.width + 80,

          y: stageNode.position.y

        },

        [asset],

        '导演台截图',

        nodeId,

        undefined,

        true

      )

      const change = stageChange()

      change.createdNodeIds.push(...ids)

      return {

        ok: true,

        result: { assetPath: asset.path, nodeIds: ids },

        change

      }

    },


    stage_get: async (call) => {
      const { doc } = await readDoc(nodeId)
      return { ok: true, result: stageSummary(doc) }
    },

    stage_add_object: async (call) => {
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
    },

    stage_transform_object: async (call) => {
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
    },

    stage_add_camera: async (call) => {
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
    },

    stage_transform_camera: async (call) => {
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
    },

    stage_set_active_camera: async (call) => {
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
    },

    stage_remove_object: async (call) => {
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
    },

    stage_add_shot: async (call) => {
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
    },

    stage_update_shot: async (call) => {
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
    },

    stage_remove_shot: async (call) => {
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
    },

    stage_set_camera_track: async (call) => {
      await ensureStageOpen(nodeId)
      const shotId = String(call.args.shotId ?? '')
      const raw = Array.isArray(call.args.keyframes) ? call.args.keyframes : []
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
    },

    stage_set_shot_intent: async (call) => {
      await ensureStageOpen(nodeId)
      const shotId = String(call.args.shotId ?? '')
      const rawIntent = call.args.intent
      if (!rawIntent || typeof rawIntent !== 'object') {
        return { ok: false, error: 'intent 参数无效' }
      }
      const intent = rawIntent as StageShotIntent
      if (!Array.isArray(intent.keys) || intent.keys.length === 0) {
        return { ok: false, error: 'intent.keys 不能为空' }
      }
      const { doc } = await readDoc(nodeId)
      const shot = doc.shots.find((item) => item.id === shotId)
      if (!shot) return { ok: false, error: '找不到这个镜头' }
      let solved
      try {
        solved = solveStageShotIntent(doc, { ...shot, intent })
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
      const updated = await applyToStage(
        nodeId,
        [
          {
            type: 'setShotIntent',
            shotId,
            intent,
            track: solved.track,
            solvedAt: new Date().toISOString()
          }
        ],
        call.turnId
      )
      return {
        ok: true,
        result: {
          shotId,
          keyframeCount:
            updated.shots.find((item) => item.id === shotId)?.cameraTrack
              ?.length ?? solved.track.length,
          notes: solved.notes
        },
        change: stageChange()
      }
    },

    stage_clear_shot_intent: async (call) => {
      await ensureStageOpen(nodeId)
      const shotId = String(call.args.shotId ?? '')
      const updated = await applyToStage(
        nodeId,
        [{ type: 'clearShotIntent', shotId }],
        call.turnId
      )
      return {
        ok: true,
        result: {
          shotId,
          keyframeCount:
            updated.shots.find((item) => item.id === shotId)?.cameraTrack
              ?.length ?? 0
        },
        change: stageChange()
      }
    },

    stage_auto_coverage: async (call) => {
      await ensureStageOpen(nodeId)
      const { doc } = await readDoc(nodeId)
      const subjectIds = Array.isArray(call.args.subjectIds)
        ? call.args.subjectIds.map((id) => String(id))
        : []
      const rawMode = String(call.args.mode ?? 'auto')
      const mode = (
        ['auto', 'single', 'dialogue', 'group'].includes(rawMode)
          ? rawMode
          : 'auto'
      ) as 'auto' | 'single' | 'dialogue' | 'group'
      const pace = typeof call.args.pace === 'number' ? call.args.pace : 1
      const replace = call.args.replace !== false
      const plan = buildAutoCoverage(doc, {
        subjectIds,
        mode,
        pace,
        replace
      })
      if (plan.shots.length === 0) {
        return {
          ok: false,
          error: plan.notes[0] ?? '自动分镜没有生成镜头'
        }
      }
      const updated = await applyToStage(
        nodeId,
        [
          {
            type: 'replaceCoverage',
            cameras: plan.cameras,
            shots: plan.shots,
            mode: replace ? 'replace' : 'append'
          }
        ],
        call.turnId
      )
      return {
        ok: true,
        result: {
          shotIds: plan.shots.map((shot) => shot.id),
          shotCount: plan.shots.length,
          shotTotal: updated.shots.length,
          notes: plan.notes
        },
        change: stageChange()
      }
    },

    stage_dialogue_coverage: async (call) => {
      await ensureStageOpen(nodeId)
      const script = String(call.args.script ?? '')
      const lines = parseDialogue(script)
      if (lines.length === 0) {
        return {
          ok: false,
          error: '没有识别到对白，请按「角色：台词」每行一句'
        }
      }
      const { doc } = await readDoc(nodeId)
      const pace = typeof call.args.pace === 'number' ? call.args.pace : 1
      const plan = buildDialogueCoverage(doc, lines, { pace })
      if (plan.shots.length === 0) {
        return {
          ok: false,
          error: plan.notes[0] ?? '按对白分镜没有生成镜头'
        }
      }
      const updated = await applyToStage(
        nodeId,
        [
          {
            type: 'replaceCoverage',
            cameras: plan.cameras,
            shots: plan.shots,
            mode: 'replace'
          }
        ],
        call.turnId
      )
      return {
        ok: true,
        result: {
          shotIds: plan.shots.map((shot) => shot.id),
          shotCount: plan.shots.length,
          shotTotal: updated.shots.length,
          notes: plan.notes
        },
        change: stageChange()
      }
    },

    stage_add_objects: async (call) => {
      await ensureStageOpen(nodeId)
      const raw = call.args.objects
      if (!Array.isArray(raw) || raw.length === 0) {
        return { ok: false, error: 'objects 不能为空' }
      }

      const { doc } = await readDoc(nodeId)
      const counts = new Map<string, number>()
      for (const object of doc.objects) {
        const key = object.name.replace(/\s+\d+$/, '')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }

      const commands: StageCommand[] = []
      const objectIds: string[] = []

      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue
        const item = entry as Record<string, unknown>
        const type = String(item.type ?? '') as StageObjectType
        if (!type) continue
        const baseName =
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : (OBJECT_LABEL[type] ?? type)
        const next = (counts.get(baseName) ?? 0) + 1
        counts.set(baseName, next)
        const object: StageObject = {
          id: generateId('object'),
          type,
          name: next > 1 ? `${baseName} ${next}` : baseName,
          transform: {
            position: readVec(item.position, [0, 0, 0]),
            rotation: readVec(item.rotation, [0, 0, 0]),
            scale: readVec(item.scale, [1, 1, 1])
          },
          ...(typeof item.pose === 'string' && item.pose.trim()
            ? { pose: item.pose.trim() }
            : {}),
          ...(typeof item.color === 'string' && item.color.trim()
            ? { color: item.color.trim() }
            : {}),
          ...(type === 'crowd' && typeof item.count === 'number'
            ? { count: item.count }
            : {})
        }
        objectIds.push(object.id)
        commands.push({ type: 'addObject', object })
      }

      if (commands.length === 0) {
        return { ok: false, error: '没有可添加的对象' }
      }

      const updated = await applyToStage(nodeId, commands, call.turnId)
      return {
        ok: true,
        result: {
          objectCount: objectIds.length,
          objectIds,
          totalObjects: updated.objects.length
        },
        change: stageChange()
      }
    },

    stage_from_scene_image: async (call) => {
      await ensureStageOpen(nodeId)
      const imagePath = String(call.args.imagePath ?? '')
      if (!imagePath.trim()) {
        return { ok: false, error: 'imagePath 不能为空' }
      }
      const imageScope =
        call.args.imageScope === 'global'
          ? 'global'
          : call.args.imageScope === 'project'
            ? 'project'
            : undefined
      const modelKey =
        typeof call.args.modelKey === 'string' ? call.args.modelKey : undefined
      try {
        const result = await generateStageFromScene({
          imagePath,
          imageScope,
          modelKey,
          prompt:
            typeof call.args.prompt === 'string' ? call.args.prompt : undefined
        })
        return {
          ok: true,
          result,
          change: stageChange()
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },

    stage_set_background: async (call) => {
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
    },

    stage_update_object: async (call) => {
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
    },

    stage_set_action_track: async (call) => {
      const shotId = String(call.args.shotId ?? '')
      const objectId = String(call.args.objectId ?? '')
      const rawKeys = Array.isArray(call.args.keys) ? call.args.keys : []
      const keys: ActionKeyframe[] = rawKeys.map((entry) => {
        const key = entry as Record<string, unknown>
        return {
          timeMs: Number(key.timeMs),
          ...(key.position !== undefined
            ? { position: readVec(key.position, [0, 0, 0]) }
            : {}),
          ...(key.rotation !== undefined
            ? { rotation: readVec(key.rotation, [0, 0, 0]) }
            : {}),
          ...(typeof key.pose === 'string' ? { pose: key.pose } : {}),
          ...(typeof key.easing === 'string'
            ? { easing: key.easing as StageEasing }
            : {})
        }
      })
      const track: ActionTrack = { objectId, keys }
      const updated = await applyToStage(
        nodeId,
        [{ type: 'setActionTrack', shotId, track }],
        call.turnId
      )
      return {
        ok: true,
        result: {
          shotId,
          objectId,
          keyCount: keys.length,
          object:
            updated.objects.find((item) => item.id === objectId) ?? null
        },
        change: stageChange()
      }
    },

    stage_previs_plan: async (call) => {
      const summary = String(call.args.summary ?? '')
      const steps = Array.isArray(call.args.steps) ? call.args.steps : []
      const planText = [
        `预演计划：${summary}`,
        '',
        ...steps.map((entry, index) => {
          const step = entry as Record<string, unknown>
          return `${index + 1}. ${String(step.reason ?? step.name ?? '')}\n   工具：${String(step.name ?? '')}\n   参数：${JSON.stringify(step.args ?? {})}`
        })
      ].join('\n')
      const approved = await new Promise<boolean>((resolve) => {
        useUIStore.getState().requestConfirm({
          title: '确认批量预演计划',
          message: planText,
          confirmLabel: '允许执行',
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false)
        })
      })
      return {
        ok: true,
        result: { approved, stepCount: steps.length, summary },
        change: stageChange()
      }
    },

    stage_export_preview: async (call) => {
      const { doc } = await readDoc(nodeId)
      const scope = call.args.scope === 'program' ? 'program' : 'shot'
      const shotId =
        typeof call.args.shotId === 'string' ? call.args.shotId : ''
      if (scope === 'shot' && !doc.shots.some((shot) => shot.id === shotId)) {
        return { ok: false, error: '找不到这个镜头' }
      }
      const stageNodeEntry = stageNode(nodeId)
      const resolution = call.args.resolution === '1080p' ? '1080p' : '720p'
      const fps = call.args.fps === 30 ? 30 : 24
      const items =
        call.args.items && typeof call.args.items === 'object'
          ? (call.args.items as Parameters<
              typeof exportStagePreviewToCanvas
            >[0]['items'])
          : undefined
      const frameDensity =
        call.args.frameDensity === 'first-only'
          ? 'first-only'
          : call.args.frameDensity === 'three'
            ? 'three'
            : undefined

      const result = await exportStagePreviewToCanvas({
        stageNodeId: stageNodeEntry.id,
        stageId: doc.stageId,
        scope,
        ...(scope === 'shot' ? { shotId } : {}),
        resolution,
        fps,
        ...(items ? { items } : {}),
        ...(frameDensity ? { frameDensity } : {}),
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
          height: result.asset.height ?? null,
          clipCount: result.clips?.length ?? 0,
          frameCount: result.frames?.length ?? 0,
          documentCount: result.documents?.length ?? 0
        },
        change
      }
    }
  }

  const handler = handlers[call.name]
  if (handler) return handler(call)

  return { ok: false, error: `未实现的导演台工具：${call.name}` }
}
