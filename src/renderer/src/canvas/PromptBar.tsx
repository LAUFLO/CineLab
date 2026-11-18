import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow, useViewport } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import {
  MEDIA_INPUT_LABEL,
  inferActiveMode,
  type Capability,
  type MediaInput,
  type ModeContext,
  type ModelDef,
  type ParamDef
} from '@shared/provider-schema'
import { effectiveCapabilities } from '@shared/capabilities'
import { referenceInputErrors } from '@shared/reference-inputs'
import { applyParamConstraints } from '@shared/param-constraints'
import {
  MODEL_MODE_LABEL,
  getModelModeDefinition,
  type ModelModeId
} from '@shared/model-modes'
import type { ReferenceInput, ReferenceRole } from '@shared/generation'
import { Icon } from '../components/Icon'
import {
  IconButton,
  Input,
  MenuItem,
  Select,
  Switch,
  Button,
  Textarea
} from '../components/ui'
import {
  absolutePosition,
  isGroupNode,
  nodeOutputs,
  selectedNodeOutput,
  useCanvasStore
} from '../stores/canvas'
import { useGenerationStore } from '../stores/generation'
import { useLibraryStore } from '../stores/library'
import { usePreferencesStore } from '../stores/preferences'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { assetUrl } from '../lib/asset-url'
import { studioOpen } from '../studio/scope'
import { MentionMenu } from './promptbar/MentionMenu'
import { ModelMenu } from './promptbar/ModelMenu'
import { ParamPanel } from './promptbar/ParamPanel'
import { UploadMenu } from './promptbar/UploadMenu'
import { MaskEditorDialog } from './nodes/MaskEditorDialog'

import {
  WIDTH,
  HEIGHT,
  PLACEHOLDER,
  ModelOption,
  defaultParams,
  paramLabel,
  ratioOf,
  MentionGroupName,
  RefKind,
  PickedRef,
  MentionItem,
  VIDEO_PATH,
  MAX_TEXT_CONTEXT,
  TextContext,
  buildPromptWithContext,
  isVideoPath,
  MENTION_GROUPS,
  escapeRegExp,
  renderMentionText
} from './promptbar-model'

interface ModeSlotView {
  id: string
  label: string
  ref: PickedRef | null
  role: ReferenceRole
  mask?: string | null
}

const TOOL_CLASS =
  'inline-flex h-6 items-center gap-[5px] whitespace-nowrap !rounded-[6px] px-[7px] text-xs !font-normal transition-colors'
const TOOL_ACTIVE_CLASS =
  'bg-fg !text-fg-inverse hover:!bg-fg hover:!text-fg-inverse'

const CHIP_CLASS =
  'inline-flex h-[26px] items-center gap-1 whitespace-nowrap !rounded-[6px] px-2 text-xs !font-normal'
const CHIP_IDLE_CLASS = 'bg-surface-hover'
const CHIP_WARN_CLASS =
  'bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface-hover))] !text-danger hover:!text-danger'

const SLOT_FRAME_CLASS =
  '!flex h-10 w-10 overflow-hidden !rounded-[6px] border border-border p-0'
const SLOT_THUMB_CLASS = `${SLOT_FRAME_CLASS} bg-surface-hover`
const SLOT_THUMB_MASK_CLASS = `${SLOT_FRAME_CLASS} bg-[color-mix(in_srgb,var(--danger)_26%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_26%,transparent)]`
const SLOT_MEDIA_CLASS = 'block h-full w-full object-cover'
const SLOT_EMPTY_CLASS =
  'flex h-10 w-10 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-surface-hover text-[10px] text-fg-subtle'
const SLOT_EMPTY_ACTION_CLASS =
  '!flex h-10 w-10 overflow-hidden !rounded-[6px] border border-dashed border-border bg-surface-hover p-0 text-[10px] !font-normal !text-fg-subtle enabled:hover:border-link enabled:hover:!text-link disabled:cursor-not-allowed disabled:!pointer-events-auto disabled:hover:!text-fg-subtle disabled:!opacity-60'

const MIRROR_CLASS =
  'pointer-events-none absolute inset-0 h-full w-full overflow-hidden whitespace-pre-wrap break-words bg-transparent px-1.5 py-2 text-sm leading-5 text-fg [word-break:break-word]'
const INPUT_CLASS =
  'absolute inset-0 h-full w-full !min-h-0 !resize-none !rounded-none !border-0 !bg-transparent !px-1.5 py-2 !text-transparent caret-fg text-sm leading-5 outline-none overflow-y-auto placeholder:text-fg-subtle'

const SEND_CLASS = '!rounded-full'
const SEND_IDLE_CLASS = 'bg-surface-hover !text-fg-subtle'
const SEND_READY_CLASS =
  'bg-fg !text-fg-inverse hover:!bg-fg hover:!text-fg-inverse'
const SEND_STOP_CLASS =
  'bg-danger !text-media-text hover:!bg-danger hover:!text-media-text'

export function PromptBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange)
  const { flowToScreenPosition, fitView } = useReactFlow()
  const viewport = useViewport()

  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const openLibrary = useLibraryStore((state) => state.openPanel)
  const characters = useLibraryStore((state) => state.characters)
  const materials = useLibraryStore((state) => state.allAssets)
  const loadLibrary = useLibraryStore((state) => state.refresh)
  const preferredModels = usePreferencesStore(
    (state) => state.preferences.generation.defaultModels
  )
  const autoLinkPreference = usePreferencesStore(
    (state) => state.preferences.generation.autoLink
  )
  const watermarkPreference = usePreferencesStore(
    (state) => state.preferences.generation.watermark
  )
  const setDefaultModel = usePreferencesStore((state) => state.setDefaultModel)
  const updateGeneration = usePreferencesStore(
    (state) => state.updateGeneration
  )
  const pendingPrompt = useUIStore((state) => state.pendingPrompt)
  const clearPendingPrompt = useUIStore((state) => state.clearPendingPrompt)

  const runGeneration = useGenerationStore((state) => state.run)
  const cancelGeneration = useGenerationStore((state) => state.cancel)

  const [modelKey, setModelKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})
  const [inputMode, setInputMode] = useState<ModelModeId | null>(null)
  const [draggedSlot, setDraggedSlot] = useState<string | null>(null)
  const [maskDraft, setMaskDraft] = useState<{
    dataUrl: string
    sourceKey: string
  } | null>(null)
  const [maskEditor, setMaskEditor] = useState<{
    src: string
    width: number
    height: number
    sourceKey: string
  } | null>(null)
  const [customParamKeys, setCustomParamKeys] = useState<Set<string>>(new Set())
  const [promptText, setPromptText] = useState('')
  const [paramMenuKey, setParamMenuKey] = useState<string | null>(null)
  const [pickedRefs, setPickedRefs] = useState<PickedRef[]>([])
  const [picking, setPicking] = useState(false)
  const [pickHint, setPickHint] = useState<string | null>(null)
  const [autoLink, setAutoLink] = useState(autoLinkPreference)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [watermark, setWatermark] = useState(watermarkPreference)
  const [expanded, setExpanded] = useState(false)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [refPreview, setRefPreview] = useState<{
    path: string
    kind: RefKind
    scope?: ReferenceInput['scope']
    x: number
    y: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const uploadRef = useRef<HTMLDivElement>(null)
  const refClickTimer = useRef<number | null>(null)
  const promptRef = useRef('')
  const promptSaveTimer = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const showToast = useUIStore((state) => state.showToast)

  useEffect(() => {
    if (!uploadMenuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (
        uploadRef.current &&
        event.target instanceof Node &&
        !uploadRef.current.contains(event.target)
      ) {
        setUploadMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [uploadMenuOpen])

  const selectedNodes = nodes.filter((item) => item.selected)
  const single = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const node =
    single &&
    single.type === 'cine' &&
    !single.data.assetOnly &&
    single.data.kind !== 'study'
      ? single
      : undefined
  const kind: NodeKind = node?.data.kind ?? 'image'
  const runningMap = useGenerationStore((state) => state.running)
  const runningRunId = node ? runningMap[node.id] : undefined

  useEffect(() => {
    const currentId = node?.id
    const nextPrompt = node?.data.prompt ?? ''
    setPromptText(nextPrompt)
    promptRef.current = nextPrompt
    setMenuOpen(false)
    setPickedRefs([])
    setPicking(false)
    setPickHint(null)
    setParamMenuKey(null)
    setExpanded(false)
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStart(null)
    setMentionIndex(0)
    setMaskDraft(null)
    setMaskEditor(null)
    setRefPreview(null)
    setInputMode(null)

    return () => {
      if (!currentId) return
      if (promptSaveTimer.current) {
        window.clearTimeout(promptSaveTimer.current)
        promptSaveTimer.current = null
      }
      useCanvasStore.getState().patchNodeData(currentId, {
        prompt: promptRef.current
      })
    }
  }, [node?.id])

  useEffect(() => {
    if (!pendingPrompt) return
    setPromptText(pendingPrompt)
    clearPendingPrompt()
  }, [pendingPrompt, clearPendingPrompt])

  useEffect(() => {
    if (!node) return
    const nextPrompt = node.data.prompt ?? ''
    if (promptRef.current === nextPrompt) return
    setPromptText(nextPrompt)
    promptRef.current = nextPrompt
  }, [node?.id, node?.data.prompt])

  useEffect(() => {
    setAutoLink(autoLinkPreference)
  }, [autoLinkPreference])

  useEffect(() => {
    setWatermark(watermarkPreference)
  }, [watermarkPreference])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    if (!expanded) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.promptbar')) return
      setExpanded(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (studioOpen()) return
      if (event.key === 'Escape') setExpanded(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  useEffect(() => {
    if (!pickHint) return
    const timer = window.setTimeout(() => setPickHint(null), 2600)
    return () => window.clearTimeout(timer)
  }, [pickHint])

  useEffect(() => {
    if (!mentionOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.mention-menu')) return
      if (target.closest('[data-promptbar-input]')) return
      setMentionOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [mentionOpen])

  useEffect(() => {
    if (!mentionOpen) return
    const active = document.querySelector('.mention-menu__item.is-active')
    active?.scrollIntoView({ block: 'nearest' })
  }, [mentionIndex, mentionOpen])

  useEffect(() => {
    if (!paramMenuKey && !advancedOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (paramMenuKey && !target.closest('.param-picker'))
        setParamMenuKey(null)
      if (
        advancedOpen &&
        !target.closest('[data-promptbar-advanced]') &&
        !target.closest('[data-promptbar-advanced-trigger]')
      ) {
        setAdvancedOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [paramMenuKey, advancedOpen])

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (!suppressClickRef.current) return
      const target = event.target as HTMLElement
      if (target.closest('.promptbar')) return
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!picking || !node) return

    document.body.dataset.picking = ''

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.promptbar')) return
      if (target.closest('.canvas-pick-bar')) return

      event.preventDefault()
      event.stopPropagation()
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 900)

      const nodeEl = target.closest('.react-flow__node') as HTMLElement | null
      const sourceId = nodeEl?.dataset.id
      if (!sourceId) {
        setPicking(false)
        return
      }

      const source = nodes.find((item) => item.id === sourceId)
      if (!source || isGroupNode(source)) {
        setPicking(false)
        return
      }
      const output = selectedNodeOutput(source)

      setPicking(false)
      if (!output) {
        setPickHint('该节点还没有输出')
        return
      }
      if (output.kind !== 'image' && output.kind !== 'video') {
        setPickHint('只能引用图片或视频输出')
        return
      }
      if (output.kind === 'video' && kind !== 'video') {
        setPickHint('只有视频节点可以引用视频输出')
        return
      }

      const refKind: RefKind = output.kind === 'video' ? 'video' : 'image'
      onConnect({ source: sourceId, target: node.id })
      setPickedRefs((prev) =>
        prev.some(
          (ref) =>
            ref.path === output.path &&
            (ref.scope ?? 'project') === (output.scope ?? 'project')
        )
          ? prev
          : [
              {
                path: output.path,
                role: 'reference',
                scope: output.scope,
                kind: refKind
              }
            ]
      )
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (studioOpen()) return
      if (event.key === 'Escape') setPicking(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      delete document.body.dataset.picking
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [picking, nodes, node?.id, kind, onConnect])

  const models = useMemo<ModelOption[]>(() => {
    const matches = (capability: Capability): boolean => {
      if (kind === 'study') return false
      if (kind === 'video') return capability === 'video.t2v'
      if (kind === 'image')
        return capability === 'image.t2i' || capability === 'image.i2i'
      if (kind === 'text') return capability === 'text.chat'
      if (kind === 'audio')
        return capability === 'audio.tts' || capability === 'audio.music'
      return true
    }

    return providers
      .flatMap((provider) =>
        provider.models.map((model) => ({
          key: `${provider.id}/${model.id}`,
          providerName: provider.name,
          model
        }))
      )
      .filter((item) => matches(item.model.capability))
  }, [providers, kind])

  const capabilityGroup = kind === 'study' ? 'image' : kind
  const active =
    models.find((item) => item.key === modelKey) ??
    models.find((item) => item.key === preferredModels[capabilityGroup]) ??
    models[0] ??
    null
  const quickModeContext: ModeContext = (() => {
    const incoming = node
      ? edges.filter((edge) => edge.target === node.id)
      : []
    let imageCount = 0
    let videoCount = 0

    for (const edge of incoming) {
      const source = nodes.find((item) => item.id === edge.source)
      if (!source) continue
      const entries = isGroupNode(source)
        ? nodes.filter((item) => item.parentId === source.id)
        : [source]
      for (const entry of entries) {
        if (isGroupNode(entry)) continue
        const output = selectedNodeOutput(entry)
        if (!output) continue
        if (output.kind === 'video') videoCount += 1
        if (output.kind === 'image') imageCount += 1
      }
    }

    return {
      kind: kind === 'image' || kind === 'video' ? kind : null,
      imageCount,
      videoCount,
      hasFirstFrame: imageCount >= 1,
      hasLastFrame: imageCount >= 2
    }
  })()

  const activeMode =
    inputMode ??
    (active && node
      ? inferActiveMode(active.model, quickModeContext)
      : undefined)
  const constrained = active
    ? applyParamConstraints(active.model.params, {
        mode: activeMode,
        values: { ...defaultParams(active.model), ...paramValues }
      })
    : { params: [] as ParamDef[], values: {} as Record<string, unknown> }
  const values = constrained.values
  const visibleParams = constrained.params

  useEffect(() => {
    setCustomParamKeys(new Set())
  }, [active?.key])

  const paramAllowsCustom = (param: ParamDef): boolean =>
    param.allowCustom === true ||
    (param.allowCustom === undefined &&
      ['ratio', 'size', 'resolution'].includes(param.key))

  const isParamCustom = (param: ParamDef): boolean => {
    if (customParamKeys.has(param.key)) return true
    const value = values[param.key]
    return (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !(param.options ?? []).some(
        (option) => String(option.value) === String(value)
      )
    )
  }

  const enableCustomParam = (param: ParamDef): void => {
    setCustomParamKeys((current) => {
      const next = new Set(current)
      next.add(param.key)
      return next
    })
    setParamValues((current) => ({
      ...current,
      [param.key]:
        current[param.key] ?? values[param.key] ?? param.defaultValue ?? ''
    }))
  }

  const selectPreset = (param: ParamDef, value: string): void => {
    setCustomParamKeys((current) => {
      const next = new Set(current)
      next.delete(param.key)
      return next
    })
    setParamValues((current) => ({ ...current, [param.key]: value }))
  }

  const paramGroups = useMemo(() => {
    if (!active) return []
    const groups = new Map<string, ParamDef[]>()
    for (const param of visibleParams) {
      const name = param.group?.trim() || '其它'
      const list = groups.get(name) ?? []
      list.push(param)
      groups.set(name, list)
    }
    return [...groups.entries()].map(([name, params]) => ({ name, params }))
  }, [active, visibleParams])

  const paramSummary = active
    ? visibleParams
        .map((param) => paramLabel(param, values[param.key]))
        .filter((label) => label.length > 0)
        .slice(0, 4)
        .join(' · ')
    : ''

  const layout = useMemo(() => {
    if (!node) return null

    const absolute = absolutePosition(node, nodes)
    const position = flowToScreenPosition(absolute)
    const width = node.measured?.width ?? NODE_META[node.data.kind].width
    const height =
      node.measured?.height ?? NODE_META[node.data.kind].height + TITLE_HEIGHT
    const zoom = viewport.zoom

    const left = Math.max(
      16,
      Math.min(
        position.x + (width * zoom) / 2 - WIDTH / 2,
        window.innerWidth - WIDTH - 16
      )
    )
    const top = Math.max(
      16,
      Math.min(
        position.y + height * zoom + 16,
        window.innerHeight - HEIGHT - 16
      )
    )

    return { left, top }
  }, [node, nodes, flowToScreenPosition, viewport.x, viewport.y, viewport.zoom])

  const incomingImageCount = (() => {
    if (!node) return 0
    let count = 0
    for (const edge of edges) {
      if (edge.target !== node.id) continue
      const source = nodes.find((item) => item.id === edge.source)
      if (!source) continue
      const entries = isGroupNode(source)
        ? nodes.filter((item) => item.parentId === source.id)
        : [source]
      for (const entry of entries) {
        if (isGroupNode(entry)) continue
        const output = selectedNodeOutput(entry)
        if (output?.kind === 'image') count += 1
      }
    }
    return count
  })()

  useEffect(() => {
    if (kind !== 'video' || !inputMode) return
    if (inputMode === 'first-frame' && incomingImageCount !== 1) {
      setInputMode(null)
      showToast(
        incomingImageCount === 0
          ? '首帧模式需要 1 张图片，已切换为文生视频'
          : '首帧模式只能 1 张图片，已切换为全能参考'
      )
      return
    }
    if (inputMode === 'first-last' && incomingImageCount !== 2) {
      setInputMode(null)
      showToast(
        incomingImageCount < 2
          ? '首尾帧需要 2 张图片，已切换回默认模式'
          : '首尾帧最多 2 张，已切换为全能参考'
      )
    }
  }, [kind, inputMode, incomingImageCount, showToast])

  if (!node || !layout) return null

  const handleLocalUpload = async (): Promise<void> => {
    setUploadMenuOpen(false)
    try {
      const assets = await window.api.library.importAssets('场景')
      if (assets.length === 0) return

      const store = useCanvasStore.getState()
      const base = absolutePosition(node, nodes)
      const createdIds: string[] = []
      let offsetY = 0

      for (const asset of assets) {
        const kind: NodeKind =
          asset.kind === 'video'
            ? 'video'
            : asset.kind === 'audio'
              ? 'audio'
              : 'image'
        const meta = NODE_META[kind]
        const id = store.addNode(kind, {
          x: base.x - meta.width - 80,
          y: base.y + offsetY
        })
        createdIds.push(id)

        store.patchNodeData(id, {
          title: asset.name,
          status: 'done',
          assetOnly: true,
          outputs: [
            {
              id: asset.path,
              path: asset.path,
              scope: 'global',
              kind: asset.kind === 'template' ? 'image' : asset.kind,
              createdAt: asset.modifiedAt ?? new Date().toISOString(),
              model: '本地上传'
            }
          ],
          selectedOutputId: asset.path
        })

        store.onConnect({ source: id, target: node.id })
        offsetY += meta.height + TITLE_HEIGHT + 24
      }

      if (createdIds.length >= 2) {
        const groupCount = useCanvasStore
          .getState()
          .nodes.filter(isGroupNode).length
        useCanvasStore.getState().createGroupFromNodes(createdIds, {
          columns: 1,
          title: `素材组 ${groupCount + 1}`,
          color: 'amber'
        })
      }

      useCanvasStore.setState({
        nodes: useCanvasStore.getState().nodes.map((entry) => ({
          ...entry,
          selected: entry.id === node.id
        }))
      })

      showToast(`已上传 ${assets.length} 个素材并连线`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const handleRefDoubleClick = (ref: PickedRef): void => {
    if (refClickTimer.current) {
      clearTimeout(refClickTimer.current)
      refClickTimer.current = null
    }

    const target = nodes.find(
      (entry) =>
        !isGroupNode(entry) &&
        nodeOutputs(entry).some((output) => output.path === ref.path)
    )
    if (!target) return

    setRefPreview(null)
    void fitView({ nodes: [target], padding: 0.8, duration: 300, maxZoom: 1.5 })
  }

  const refsResult = (() => {
    const incoming = edges.filter((edge) => edge.target === node.id)
    const images: PickedRef[] = []
    const audios: PickedRef[] = []
    const videos: PickedRef[] = []
    let imageIndex = 0
    let droppedVideo = 0

    for (const edge of incoming) {
      const source = nodes.find((item) => item.id === edge.source)
      if (!source) continue

      const entries = isGroupNode(source)
        ? nodes.filter((item) => item.parentId === source.id)
        : [source]

      for (const entry of entries) {
        if (isGroupNode(entry)) continue

        const output = selectedNodeOutput(entry)
        if (!output) continue

        if (output.kind === 'video') {
          if (kind === 'video' && videos.length === 0) {
            videos.push({
              path: output.path,
              role: 'reference',
              scope: output.scope,
              kind: 'video'
            })
          } else if (kind === 'video') {
            droppedVideo += 1
          }
          continue
        }

        if (output.kind === 'audio') {
          if (kind === 'video') {
            audios.push({
              path: output.path,
              role: 'reference',
              scope: output.scope,
              kind: 'audio'
            })
          }
          continue
        }

        if (output.kind !== 'image') continue

        const role: ReferenceRole =
          imageIndex === 0
            ? 'firstFrame'
            : imageIndex === 1
              ? 'lastFrame'
              : 'reference'
        images.push({
          path: output.path,
          role,
          scope: output.scope,
          kind: 'image'
        })
        imageIndex += 1
      }
    }

    return {
      list: [...images, ...audios, ...videos],
      droppedVideo
    }
  })()
  const refs = refsResult.list

  const autoRefs = (() => {
    if (!autoLink) return []
    const text = promptText.trim()
    if (!text) return []

    const result: PickedRef[] = []

    for (const item of nodes) {
      if (item.id === node.id || isGroupNode(item)) continue
      if (!text.includes(item.data.title)) continue
      const output = selectedNodeOutput(item)
      if (output?.kind === 'image') {
        result.push({
          path: output.path,
          role: 'reference',
          scope: output.scope,
          kind: 'image'
        })
      } else if (output?.kind === 'video' && kind === 'video') {
        result.push({
          path: output.path,
          role: 'reference',
          scope: output.scope,
          kind: 'video'
        })
      }
    }

    for (const material of materials) {
      if (material.kind !== 'image' && material.kind !== 'video') continue
      if (material.kind === 'video' && kind !== 'video') continue
      if (!text.includes(material.name)) continue
      result.push({
        path: material.path,
        role: 'reference',
        scope: 'global',
        kind: material.kind
      })
    }

    for (const card of characters) {
      if (!text.includes(card.name)) continue
      for (const path of card.referencePaths) {
        result.push({ path, role: 'reference', scope: 'global', kind: 'image' })
      }
    }

    return result
  })()

  const rawRefsResult = (() => {
    const seen = new Set<string>()
    const result: PickedRef[] = []
    let videoCount = 0
    let droppedVideo = 0

    for (const ref of [...pickedRefs, ...autoRefs, ...refs]) {
      const key = `${ref.scope ?? 'project'}:${ref.path}`
      if (seen.has(key)) continue

      if (ref.kind === 'video') {
        if (videoCount >= 1) {
          droppedVideo += 1
          continue
        }
        videoCount += 1
      }

      seen.add(key)
      result.push(ref)
    }

    return { list: result, droppedVideo }
  })()
  const rawRefs = rawRefsResult.list
  const videoOverflow = refsResult.droppedVideo + rawRefsResult.droppedVideo

  const rawImageCount = rawRefs.filter((ref) => ref.kind === 'image').length
  const rawVideoCount = rawRefs.filter((ref) => ref.kind === 'video').length

  const inferModeContext: ModeContext = {
    kind: kind === 'image' || kind === 'video' ? kind : null,
    imageCount: rawImageCount,
    videoCount: rawVideoCount,
    hasFirstFrame: rawImageCount >= 1,
    hasLastFrame: rawImageCount >= 2
  }

  const slotMode: ModelModeId | undefined =
    inputMode ??
    (active ? inferActiveMode(active.model, inferModeContext) : undefined)

  const orderedRefs = (() => {
    const order = node?.data.refOrder ?? []
    if (order.length === 0) return rawRefs

    const keyOf = (ref: PickedRef): string =>
      `${ref.scope ?? 'project'}:${ref.path}`
    const remaining = new Map(rawRefs.map((ref) => [keyOf(ref), ref]))
    const result: PickedRef[] = []

    for (const key of order) {
      const ref = remaining.get(key)
      if (!ref) continue
      result.push(ref)
      remaining.delete(key)
    }
    for (const ref of remaining.values()) result.push(ref)
    return result
  })()

  const mergedRefs: PickedRef[] = (() => {
    let imageIndex = 0
    return orderedRefs.map((ref): PickedRef => {
      if (ref.kind === 'video') {
        return { ...ref, role: 'reference' as ReferenceRole }
      }
      if (ref.kind === 'audio') {
        return { ...ref, role: 'reference' as ReferenceRole }
      }

      const index = imageIndex
      imageIndex += 1

      if (kind !== 'video') {
        return { ...ref, role: 'reference' as ReferenceRole }
      }
      if (slotMode === 'first-frame') {
        return { ...ref, role: index === 0 ? 'firstFrame' : 'reference' }
      }
      if (slotMode === 'first-last') {
        const role: ReferenceRole =
          index === 0 ? 'firstFrame' : index === 1 ? 'lastFrame' : 'reference'
        return { ...ref, role }
      }
      return { ...ref, role: 'reference' as ReferenceRole }
    })
  })()
  const swapRefs = (fromKey: string, toKey: string): void => {
    if (!node || fromKey === toKey) return

    const keyOf = (ref: PickedRef): string =>
      `${ref.scope ?? 'project'}:${ref.path}`
    const current = orderedRefs.map(keyOf)
    const fromIndex = current.indexOf(fromKey)
    const toIndex = current.indexOf(toKey)
    if (fromIndex < 0 || toIndex < 0) return

    const next = [...current]
    next[fromIndex] = toKey
    next[toIndex] = fromKey
    useCanvasStore.getState().patchNodeData(node.id, { refOrder: next })
  }

  const textContexts = (() => {
    const result: TextContext[] = []
    const seen = new Set<string>()

    const collect = (entry: (typeof nodes)[number]): void => {
      if (entry.type !== 'cine' || entry.data.kind !== 'text') return
      if (seen.has(entry.id)) return
      const text = entry.data.text?.trim()
      if (!text) return
      seen.add(entry.id)
      result.push({ title: entry.data.title, text })
    }

    const incoming = edges.filter((edge) => edge.target === node.id)
    for (const edge of incoming) {
      const source = nodes.find((item) => item.id === edge.source)
      if (!source) continue
      const entries = isGroupNode(source)
        ? nodes.filter((item) => item.parentId === source.id)
        : [source]
      for (const entry of entries) {
        if (isGroupNode(entry)) continue
        collect(entry)
      }
    }

    if (autoLink) {
      const text = promptText.trim()
      if (text) {
        for (const item of nodes) {
          if (item.id === node.id || isGroupNode(item)) continue
          if (!text.includes(item.data.title)) continue
          collect(item)
        }
      }
    }

    return result
  })()

  const requiredInputs = (() => {
    const inputs: MediaInput[] = ['text']
    if (mergedRefs.some((ref) => ref.kind === 'image')) inputs.push('image')
    if (mergedRefs.some((ref) => ref.kind === 'video')) inputs.push('video')
    return inputs
  })()

  const capabilities = active ? effectiveCapabilities(active.model) : null

  const activeMissing =
    active && capabilities
      ? requiredInputs.filter((input) => !capabilities.media.includes(input))
      : []

  const availableModes = (() => {
    if (!active || !capabilities) {
      return [] as Array<{ id: ModelModeId; disabled: boolean; hint?: string }>
    }
    const supported = capabilities.modes
    const candidates: ModelModeId[] =
      kind === 'image'
        ? ['t2i', 'i2i', 'layer']
        : kind === 'video'
          ? ['t2v', 'first-frame', 'first-last', 'reference']
          : []

    return candidates
      .filter((id) => supported.includes(id))
      .map((id) => {
        if (kind === 'video') {
          if (id === 't2v' && rawImageCount > 0) {
            return { id, disabled: true, hint: '已连接图片，文生视频不可用' }
          }
          if (id === 'first-frame' && rawImageCount !== 1) {
            return {
              id,
              disabled: true,
              hint:
                rawImageCount === 0
                  ? '需要 1 张图片'
                  : `已连接 ${rawImageCount} 张，首帧模式只能 1 张`
            }
          }
          if (id === 'first-last' && rawImageCount !== 2) {
            return {
              id,
              disabled: true,
              hint:
                rawImageCount < 2
                  ? '需要 2 张图片'
                  : `已连接 ${rawImageCount} 张，首尾帧只能 2 张`
            }
          }
        }
        if (kind === 'image') {
          if (id === 't2i' && rawImageCount > 0) {
            return { id, disabled: true, hint: '已连接图片，文生图不可用' }
          }
          if (id === 'layer' && rawImageCount !== 1) {
            return { id, disabled: true, hint: '需要 1 张源图' }
          }
        }
        return { id, disabled: false }
      })
  })()

  const modeContext: ModeContext = {
    kind: kind === 'image' || kind === 'video' ? kind : null,
    imageCount: mergedRefs.filter((ref) => ref.kind === 'image').length,
    videoCount: mergedRefs.filter((ref) => ref.kind === 'video').length,
    hasFirstFrame: mergedRefs.some(
      (ref) => ref.kind === 'image' && ref.role === 'firstFrame'
    ),
    hasLastFrame: mergedRefs.some(
      (ref) => ref.kind === 'image' && ref.role === 'lastFrame'
    )
  }

  const maskSource =
    mergedRefs.find(
      (ref) => ref.kind === 'image' && ref.role === 'reference'
    ) ?? null
  const maskSourceKey = maskSource
    ? `${maskSource.scope ?? 'project'}:${maskSource.path}`
    : null
  const activeMask =
    maskDraft && maskDraft.sourceKey === maskSourceKey
      ? maskDraft.dataUrl
      : null

  const openMaskEditor = (ref: PickedRef): void => {
    const src = assetUrl(ref.path, ref.scope)
    const sourceKey = `${ref.scope ?? 'project'}:${ref.path}`
    const image = new Image()
    image.onload = () => {
      setMaskEditor({
        src,
        width: image.naturalWidth || 1024,
        height: image.naturalHeight || 1024,
        sourceKey
      })
    }
    image.onerror = () => {
      showToast('读取参考图失败，无法打开蒙版编辑器', 'error')
    }
    image.src = src
  }

  const modeSlots: ModeSlotView[] = (() => {
    const empty: ModeSlotView[] = []
    if (!slotMode) return empty
    const definition = getModelModeDefinition(slotMode)
    if (!definition) return empty
    const slots = definition.slots
    const images = mergedRefs.filter(
      (ref) => ref.kind === 'image' && ref.role !== 'mask'
    )
    const videos = mergedRefs.filter((ref) => ref.kind === 'video')
    const audios = mergedRefs.filter((ref) => ref.kind === 'audio')
    let imageIndex = 0

    const roleOf = (role: (typeof slots)[number]['role']): ReferenceRole => {
      if (
        role === 'firstFrame' ||
        role === 'lastFrame' ||
        role === 'reference' ||
        role === 'mask' ||
        role === 'subject' ||
        role === 'source'
      ) {
        return role
      }
      return 'reference'
    }

    const list = slots.flatMap<ModeSlotView>((slot) => {
      if (slot.media === 'text') return []
      if (slot.media === 'video') {
        if (videos.length === 0 || !capabilities?.media.includes('video')) {
          return []
        }
        return [
          {
            id: slot.id,
            label: slot.label,
            ref: videos[0],
            role: 'reference' as ReferenceRole
          }
        ]
      }
      if (slot.media === 'audio') {
        if (audios.length === 0 || !capabilities?.media.includes('audio')) {
          return []
        }
        return audios.map((ref, index) => ({
          id: `${slot.id}-${index}`,
          label: audios.length > 1 ? String(index + 1) : slot.label,
          ref,
          role: 'reference' as ReferenceRole
        }))
      }
      if (slot.role === 'mask') {
        return [
          {
            id: slot.id,
            label: slot.label,
            ref: null,
            role: 'mask' as ReferenceRole,
            mask: activeMask
          }
        ]
      }
      if (slot.role === 'reference') {
        const refs = images.filter((ref) => ref.role === 'reference')
        if (refs.length === 0) return []
        return refs.map((ref, index) => ({
          id: `${slot.id}-${index}`,
          label: refs.length > 1 ? String(index + 1) : slot.label,
          ref,
          role: 'reference' as ReferenceRole
        }))
      }
      const ref = images[imageIndex++] ?? null
      return [
        {
          id: slot.id,
          label: slot.label,
          ref,
          role: roleOf(slot.role)
        }
      ]
    })

    // 固定槽位之外的素材也留在槽位条里，避免「连了图但看不见」
    const keyOf = (ref: PickedRef): string =>
      `${ref.scope ?? 'project'}:${ref.path}`
    const used = new Set<string>()
    for (const slot of list) {
      if (slot.ref) used.add(keyOf(slot.ref))
    }
    for (const ref of mergedRefs) {
      if (ref.role === 'mask') continue
      if (used.has(keyOf(ref))) continue
      // 能力表不支持的媒体不进入槽位条，由模型芯片提示
      if (ref.kind === 'video' && !capabilities?.media.includes('video')) {
        continue
      }
      if (ref.kind === 'audio' && !capabilities?.media.includes('audio')) {
        continue
      }
      used.add(keyOf(ref))
      list.push({
        id: `extra-${keyOf(ref)}`,
        label:
          ref.kind === 'video'
            ? '未分配视频'
            : ref.kind === 'audio'
              ? '未分配音频'
              : '未分配',
        ref,
        role: ref.role
      })
    }

    return list
  })()

  const inputLabel = (inputs: MediaInput[]): string =>
    inputs.map((input) => MEDIA_INPUT_LABEL[input]).join('、')

  const updatePromptText = (value: string): void => {
    setPromptText(value)
    promptRef.current = value

    const id = node?.id
    if (!id) return
    if (promptSaveTimer.current) window.clearTimeout(promptSaveTimer.current)
    promptSaveTimer.current = window.setTimeout(() => {
      promptSaveTimer.current = null
      useCanvasStore.getState().patchNodeData(id, { prompt: value })
    }, 350)
  }

  const refKey = (ref: Pick<ReferenceInput, 'path' | 'scope'>): string =>
    `${ref.scope ?? 'project'}:${ref.path}`

  const mentionItems = (() => {
    if (!node) return [] as MentionItem[]

    const referenced = new Set(mergedRefs.map(refKey))
    const items: MentionItem[] = []
    const seen = new Set<string>()

    const push = (item: MentionItem): void => {
      if (seen.has(item.key)) return
      seen.add(item.key)
      items.push(item)
    }

    for (const entry of nodes) {
      if (entry.id === node.id || isGroupNode(entry)) continue
      const output = selectedNodeOutput(entry)
      if (!output || (output.kind !== 'image' && output.kind !== 'video'))
        continue
      if (output.kind === 'video' && kind !== 'video') continue

      push({
        key: `node:${entry.id}`,
        name: entry.data.title,
        group: referenced.has(refKey(output)) ? '已引用' : '画布',
        path: output.path,
        scope: output.scope,
        thumb: output.path,
        kind: output.kind
      })
    }

    for (const material of materials) {
      if (
        material.kind !== 'image' &&
        material.kind !== 'video' &&
        material.kind !== 'template'
      ) {
        continue
      }
      if (material.kind === 'video' && kind !== 'video') continue

      const ref = { path: material.path, scope: 'global' as const }
      push({
        key: `asset:${material.path}`,
        name: material.name,
        group: referenced.has(refKey(ref)) ? '已引用' : '资产库',
        path: material.path,
        scope: 'global',
        thumb: material.thumbnail ?? material.path,
        kind: material.kind === 'video' ? 'video' : 'image'
      })
    }

    for (const card of characters) {
      if (card.referencePaths.length === 0) continue
      const refs = card.referencePaths.map((path) => ({
        path,
        role: 'reference' as const,
        scope: 'global' as const
      }))

      push({
        key: `character:${card.id}`,
        name: card.name,
        group: '角色',
        path: card.referencePaths[0],
        scope: 'global',
        thumb: card.avatarPath ?? card.referencePaths[0],
        refs,
        kind: 'image'
      })
    }

    return items
  })()

  const mentionFiltered = mentionItems.filter((item) =>
    mentionQuery
      ? item.name.toLowerCase().includes(mentionQuery.toLowerCase())
      : true
  )
  const mentionGroups = MENTION_GROUPS.map((name) => ({
    name,
    items: mentionFiltered.filter((item) => item.group === name)
  })).filter((group) => group.items.length > 0)
  const flatMentions = mentionGroups.flatMap((group) => group.items)
  const mentionNames = [
    ...new Set(
      mergedRefs
        .map(
          (ref) =>
            mentionItems.find(
              (item) =>
                item.path === ref.path ||
                item.refs?.some((entry) => entry.path === ref.path)
            )?.name
        )
        .filter((name): name is string => Boolean(name))
    )
  ].sort((a, b) => b.length - a.length)

  const addRefs = (nextRefs: PickedRef[]): void => {
    setPickedRefs((prev) => {
      const seen = new Set(prev.map(refKey))
      const added = nextRefs.filter((ref) => {
        const key = refKey(ref)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return added.length > 0 ? [...prev, ...added] : prev
    })
  }

  const applyMention = (item: MentionItem): void => {
    const textarea = inputRef.current
    const cursor = textarea?.selectionStart ?? promptText.length
    const start = mentionStart ?? cursor
    const insert = `@${item.name} `
    const next = promptText.slice(0, start) + insert + promptText.slice(cursor)

    updatePromptText(next)
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStart(null)
    setMentionIndex(0)

    const refsToAdd: PickedRef[] = item.refs
      ? item.refs.map((ref) => ({ ...ref, kind: item.kind ?? 'image' }))
      : item.path
        ? [
            {
              path: item.path,
              role: 'reference' as const,
              scope: item.scope,
              kind: item.kind ?? 'image'
            }
          ]
        : []
    if (refsToAdd.length > 0) addRefs(refsToAdd)

    requestAnimationFrame(() => {
      const position = start + insert.length
      textarea?.focus()
      textarea?.setSelectionRange(position, position)
      if (textarea && mirrorRef.current) {
        mirrorRef.current.scrollTop = textarea.scrollTop
      }
    })
  }

  const handlePromptChange = (
    event: ChangeEvent<HTMLTextAreaElement>
  ): void => {
    const value = event.target.value
    updatePromptText(value)

    const cursor = event.target.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const match = /(?:^|\s)@([^\s@]*)$/.exec(before)

    if (match) {
      setMentionOpen(true)
      setMentionQuery(match[1])
      setMentionStart(cursor - match[1].length - 1)
      setMentionIndex(0)
    } else if (mentionOpen) {
      setMentionOpen(false)
    }
  }

  const isRunning = Boolean(runningRunId)
  const canSend =
    Boolean(active) &&
    (promptText.trim().length > 0 || textContexts.length > 0) &&
    !isRunning

  const handleSend = (): void => {
    if (!active || !canSend) return

    const videoRef = mergedRefs.find((ref) => ref.kind === 'video')
    if (videoRef && kind !== 'video') {
      showToast('图片节点不能引用视频，请改用视频节点', 'error')
      return
    }

    const refErrors = referenceInputErrors({
      isVideo: kind === 'video',
      mode: slotMode,
      model: active.model,
      capabilities: capabilities ?? undefined,
      imageCount: mergedRefs.filter(
        (ref) => ref.kind === 'image' && ref.role !== 'mask'
      ).length,
      audioCount: mergedRefs.filter((ref) => ref.kind === 'audio').length,
      hasSourceVideo: Boolean(videoRef),
      hasVideoOperation: false,
      hasMask: Boolean(activeMask),
      hasKeyframe: slotMode === 'first-frame' || slotMode === 'first-last'
    })
    if (refErrors.length > 0) {
      showToast(refErrors[0], 'error')
      return
    }

    const mediaRefs: ReferenceInput[] = mergedRefs
      .filter(
        (ref) =>
          (ref.kind === 'image' || ref.kind === 'audio') && ref.role !== 'mask'
      )
      .map((ref) => ({
        path: ref.path,
        role: ref.role,
        scope: ref.scope,
        media: ref.kind
      }))

    void runGeneration({
      nodeId: node.id,
      modelKey: active.key,
      prompt: buildPromptWithContext(promptText.trim(), textContexts),
      params: { ...values, watermark },
      ...(mediaRefs.length > 0 ? { refs: mediaRefs } : {}),
      ...(activeMask ? { mask: activeMask } : {}),
      ...(videoRef
        ? {
            video: {
              path: videoRef.path,
              role: videoRef.role,
              scope: videoRef.scope
            }
          }
        : {})
    })
  }

  return (
    <>
      {picking ? (
        <div className="canvas-pick-bar fixed left-1/2 top-3 z-[120] flex h-10 -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-[12px] bg-pick-bar px-2 pl-3.5 text-[13px] text-fg-inverse shadow-float [-webkit-app-region:no-drag]">
          <Icon name="frame" size={14} />
          <span>从画布选择节点作为参考</span>
          <span className="text-[11px] opacity-[0.72]">Esc 退出</span>
          <Button
            type="button"
            variant="secondary"
            size="none"
            className="!h-[26px] !rounded-[7px] !border-current !px-2.5 !py-0 text-xs !font-normal !text-inherit opacity-[0.85] hover:!border-current hover:!text-inherit hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              setPicking(false)
            }}
          >
            取消
          </Button>
        </div>
      ) : null}

      <div
        data-slot="promptbar"
        className={`flex flex-col rounded-[14px] border border-border bg-surface shadow-float ${
          expanded
            ? 'fixed left-1/2 top-1/2 z-[240] h-auto min-h-[320px] max-h-[calc(100vh-120px)] w-[min(920px,calc(100vw-96px))] -translate-x-1/2 -translate-y-1/2 px-3 pb-3 pt-2'
            : 'absolute z-50 h-[196px] animate-[promptbar-in_180ms_ease-out] px-2.5 pb-2 pt-1'
        }`}
        style={
          expanded
            ? undefined
            : { left: layout.left, top: layout.top, width: WIDTH }
        }
        onPointerDown={(event) => event.stopPropagation()}
      >
        {pickHint ? (
          <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-[5] whitespace-nowrap rounded-[8px] bg-danger px-3 py-[7px] text-xs text-media-text">
            {pickHint}
          </div>
        ) : null}

        <div className="flex h-7 shrink-0 items-center gap-0.5">
          <div className="relative inline-flex" ref={uploadRef}>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={`${TOOL_CLASS} ${
                uploadMenuOpen ? TOOL_ACTIVE_CLASS : ''
              }`}
              onClick={() => setUploadMenuOpen((open) => !open)}
            >
              <Icon name="plus" size={13} />
              上传
            </Button>

            <UploadMenu
              open={uploadMenuOpen}
              onLocalUpload={() => void handleLocalUpload()}
              onLibraryUpload={() => {
                setUploadMenuOpen(false)
                openLibrary('场景')
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className={`${TOOL_CLASS} ${picking ? TOOL_ACTIVE_CLASS : ''}`}
            onClick={() => {
              setPickHint(null)
              setPicking((open) => !open)
            }}
          >
            <Icon name="frame" size={13} />
            画布参考
          </Button>
          <div className="flex-1" />
          {autoRefs.length > 0 ? (
            <span
              className="inline-flex h-5 items-center gap-[3px] whitespace-nowrap rounded-full border border-dashed border-[color-mix(in_srgb,var(--link)_55%,transparent)] px-[7px] text-[10.5px] text-link"
              title="智能引用 AutoLink 自动匹配的素材，可在高级设置中关闭"
            >
              <Icon name="sparkles" size={10} />
              AutoLink {autoRefs.length}
            </span>
          ) : null}
          <IconButton
            label={expanded ? '收起输入框' : '展开输入框'}
            size="xs"
            className="h-6 w-6 rounded-[6px]"
            onClick={() => setExpanded((open) => !open)}
          >
            <Icon name="expand" size={13} />
          </IconButton>
        </div>

        {modeSlots.length > 0 ? (
          <div
            data-testid="promptbar-slots"
            className="flex gap-2 overflow-x-auto overflow-y-hidden px-2.5 pt-2"
          >
            {modeSlots.map((slot) => (
              <div
                className="relative h-10 w-10 shrink-0"
                key={slot.id}
                data-slot-kind={
                  slot.ref?.kind ?? (slot.role === 'mask' ? 'mask' : 'empty')
                }
              >
                <span className="pointer-events-none absolute left-0.5 top-0.5 z-[1] max-w-[calc(100%-4px)] truncate rounded-[2px] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-[3px] text-[8px] leading-3 text-fg">
                  {slot.label}
                </span>
                {slot.role === 'mask' ? (
                  <div className="relative h-full w-full">
                    {slot.mask ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className={SLOT_THUMB_MASK_CLASS}
                          title="点击重新涂抹"
                          onClick={() => {
                            if (maskSource) openMaskEditor(maskSource)
                          }}
                        >
                          <img
                            className={SLOT_MEDIA_CLASS}
                            src={slot.mask}
                            alt=""
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className="absolute right-0.5 top-0.5 h-4 w-4 !rounded-full border border-border bg-surface p-0 text-[11px] leading-none !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg"
                          title="清除蒙版"
                          onClick={() => setMaskDraft(null)}
                        >
                          ×
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className={SLOT_EMPTY_ACTION_CLASS}
                        title={
                          maskSource ? '涂抹要编辑的区域' : '先添加一张参考图'
                        }
                        disabled={!maskSource}
                        onClick={() => {
                          if (maskSource) openMaskEditor(maskSource)
                        }}
                      >
                        {maskSource ? '涂抹' : '缺参考图'}
                      </Button>
                    )}
                  </div>
                ) : slot.ref ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={SLOT_THUMB_CLASS}
                    title="拖动交换位置，双击在画布上定位"
                    draggable
                    onDragStart={() => {
                      if (!slot.ref) return
                      setDraggedSlot(
                        `${slot.ref.scope ?? 'project'}:${slot.ref.path}`
                      )
                    }}
                    onDragEnd={() => setDraggedSlot(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!slot.ref) return
                      const toKey = `${slot.ref.scope ?? 'project'}:${slot.ref.path}`
                      if (draggedSlot) swapRefs(draggedSlot, toKey)
                      setDraggedSlot(null)
                    }}
                    onPointerEnter={(event) => {
                      if (!slot.ref) return
                      const rect = event.currentTarget.getBoundingClientRect()
                      setRefPreview({
                        path: slot.ref.path,
                        kind: slot.ref.kind,
                        scope: slot.ref.scope,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8
                      })
                    }}
                    onPointerLeave={() => setRefPreview(null)}
                    onDoubleClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (slot.ref) handleRefDoubleClick(slot.ref)
                    }}
                  >
                    {slot.ref.kind === 'video' ? (
                      <video
                        className={SLOT_MEDIA_CLASS}
                        src={`${assetUrl(slot.ref.path, slot.ref.scope)}#t=0.1`}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : slot.ref.kind === 'audio' ? (
                      <span
                        className="flex h-full w-full items-center justify-center text-fg-muted"
                        title={slot.ref.path.split(/[\\/]/).pop()}
                      >
                        <Icon name="audio" size={16} />
                      </span>
                    ) : (
                      <img
                        className={SLOT_MEDIA_CLASS}
                        src={assetUrl(slot.ref.path, slot.ref.scope)}
                        alt=""
                      />
                    )}
                  </Button>
                ) : (
                  <div className={SLOT_EMPTY_CLASS}>空</div>
                )}
              </div>
            ))}
            {videoOverflow > 0 ? (
              <span
                className="inline-flex h-10 shrink-0 items-center rounded-[6px] border border-dashed border-border px-2 text-[10px] text-fg-subtle"
                title="当前数据结构只支持 1 个参考视频"
              >
                参考视频仅支持 1 个
              </span>
            ) : null}
          </div>
        ) : null}

        {/* data-promptbar-input：提及菜单用 closest 判定点击是否在输入区内 */}
        <div
          data-promptbar-input
          className={`relative flex-1 ${expanded ? 'min-h-[200px]' : 'min-h-0'}`}
        >
          <div className={MIRROR_CLASS} ref={mirrorRef} aria-hidden>
            {renderMentionText(promptText, mentionNames)}
            {'\u200b'}
          </div>

          <Textarea
            ref={inputRef}
            className={INPUT_CLASS}
            placeholder={PLACEHOLDER[kind]}
            rows={2}
            value={promptText}
            onChange={handlePromptChange}
            onScroll={(event) => {
              if (mirrorRef.current) {
                mirrorRef.current.scrollTop = event.currentTarget.scrollTop
              }
            }}
            onKeyDown={(event) => {
              if (mentionOpen) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  if (flatMentions.length === 0) return
                  event.preventDefault()
                  setMentionIndex((current) => {
                    const delta = event.key === 'ArrowDown' ? 1 : -1
                    return (
                      (current + delta + flatMentions.length) %
                      flatMentions.length
                    )
                  })
                  return
                }

                if (event.key === 'Enter') {
                  if (event.nativeEvent.isComposing) return
                  event.preventDefault()
                  const item =
                    flatMentions[
                      Math.min(mentionIndex, flatMentions.length - 1)
                    ]
                  if (item) {
                    applyMention(item)
                  } else {
                    setMentionOpen(false)
                  }
                  return
                }

                if (event.key === 'Escape') {
                  event.preventDefault()
                  setMentionOpen(false)
                  return
                }
              }

              if (event.key === 'Enter' && !event.shiftKey) {
                if (event.nativeEvent.isComposing) return
                event.preventDefault()
                handleSend()
              }
            }}
          />

          <MentionMenu
            open={mentionOpen}
            query={mentionQuery}
            groups={mentionGroups}
            flat={flatMentions}
            activeIndex={mentionIndex}
            onHover={setMentionIndex}
            onSelect={applyMention}
          />
        </div>

        <div className="relative z-[2] flex h-8 shrink-0 items-center gap-2">
          {availableModes.length > 0 && slotMode ? (
            <div className="flex shrink-0">
              <Select
                className="!h-[26px] !w-28 !min-w-0 !rounded-[6px] !border-0 !px-2 !text-xs !text-fg-muted hover:!text-fg"
                value={slotMode}
                options={availableModes.map((option) => ({
                  value: option.id,
                  label: MODEL_MODE_LABEL[option.id],
                  disabled: option.disabled,
                  hint: option.hint
                }))}
                menuWidth="trigger"
                onChange={(value) => setInputMode(value)}
              />
            </div>
          ) : null}
          {models.length === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={`${CHIP_CLASS} ${CHIP_IDLE_CLASS}`}
              onClick={() => openSettings('models')}
            >
              未配置模型
              <Icon name="chevron-down" size={11} />
            </Button>
          ) : (
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={`${CHIP_CLASS} ${
                  activeMissing.length > 0 ? CHIP_WARN_CLASS : CHIP_IDLE_CLASS
                }`}
                title={
                  activeMissing.length > 0
                    ? `当前模型不支持${inputLabel(activeMissing)}输入`
                    : undefined
                }
                onClick={() => setMenuOpen((open) => !open)}
              >
                {active?.model.name ?? '选择模型'}
                {activeMissing.length > 0 ? (
                  <span className="rounded-[4px] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-1 py-px text-[10px] text-danger">
                    不支持{inputLabel(activeMissing)}
                  </span>
                ) : null}
                <Icon name="chevron-down" size={11} />
              </Button>

              <ModelMenu
                open={menuOpen}
                models={models}
                activeKey={active?.key}
                requiredInputs={requiredInputs}
                modeContext={modeContext}
                onSelect={(item, missing, unavailable, reason) => {
                  if (unavailable) {
                    showToast(
                      reason ?? `「${item.model.name}」不支持当前输入`,
                      'error'
                    )
                    return
                  }

                  setModelKey(item.key)
                  setParamValues({})
                  setMenuOpen(false)
                  void setDefaultModel(capabilityGroup, item.key)
                }}
              />
            </div>
          )}

          {active ? (
            <div className="flex min-w-0 items-center gap-1 overflow-visible">
              <div className="param-picker relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className={`${CHIP_CLASS} ${CHIP_IDLE_CLASS} !gap-1.5`}
                  onClick={() =>
                    setParamMenuKey((open) =>
                      open === '__all__' ? null : '__all__'
                    )
                  }
                  title="生成设置"
                >
                  <span className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {paramSummary || '生成设置'}
                  </span>
                  <Icon name="chevron-down" size={10} />
                </Button>

          {paramMenuKey === '__all__' ? (
            <ParamPanel
              groups={paramGroups}
              values={values}
              watermark={watermark}
              isCustom={isParamCustom}
              allowsCustom={paramAllowsCustom}
              onSelectPreset={selectPreset}
              onEnableCustom={enableCustomParam}
              onChangeValue={(key, value) =>
                setParamValues((current) => ({ ...current, [key]: value }))
              }
              onWatermarkChange={(next) => {
                setWatermark(next)
                void updateGeneration({ watermark: next })
              }}
            />
          ) : null}
              </div>
            </div>
          ) : (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-fg-subtle">
              配置模型后生成参数会出现在这里
            </span>
          )}

          <div className="flex-1" />
          <IconButton
            label="高级设置"
            size="sm"
            className={advancedOpen ? 'bg-surface-hover text-fg' : undefined}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <Icon name="settings" size={16} />
          </IconButton>

          {isRunning ? (
            <IconButton
              label="停止生成"
              size="sm"
              className={`${SEND_CLASS} ${SEND_STOP_CLASS}`}
              onClick={() => void cancelGeneration(node.id)}
            >
              <span className="h-3 w-3 rounded-[2px] bg-current" />
            </IconButton>
          ) : (
            <IconButton
              label="生成"
              size="sm"
              className={`${SEND_CLASS} ${
                canSend ? SEND_READY_CLASS : SEND_IDLE_CLASS
              }`}
              disabled={!canSend}
              onClick={handleSend}
            >
              <Icon name="arrow-up" size={15} />
            </IconButton>
          )}
        </div>

        {advancedOpen ? (
          <div data-promptbar-advanced className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[268px] rounded-[12px] border border-border bg-surface p-3 shadow-menu">
            <div className="mb-2.5 text-xs text-fg-muted">高级设置</div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] text-fg">智能引用 AutoLink</div>
                <div className="mt-[3px] text-[11px] leading-normal text-fg-subtle">
                  自动匹配提示词中的节点、素材和角色名称，匹配结果会显示在素材缩略图中
                </div>
              </div>
              <Switch
                label="智能引用 AutoLink"
                size="sm"
                checked={autoLink}
                onChange={(next) => {
                  setAutoLink(next)
                  void updateGeneration({ autoLink: next })
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {refPreview &&
      mergedRefs.some(
        (ref) =>
          ref.path === refPreview.path &&
          (ref.scope ?? 'project') === (refPreview.scope ?? 'project')
      )
        ? createPortal(
            <div
              data-ref-preview
              className="pointer-events-none fixed z-[400] -translate-x-1/2 -translate-y-full rounded-[10px] border border-border bg-surface p-1 shadow-menu"
              style={{ left: refPreview.x, top: refPreview.y }}
            >
              {refPreview.kind === 'video' ? (
                <video
                  src={`${assetUrl(refPreview.path, refPreview.scope)}#t=0.1`}
                  muted
                  playsInline
                  autoPlay
                  loop
                  preload="metadata"
                />
              ) : refPreview.kind === 'audio' ? (
                <div className="flex items-center gap-2 rounded-[6px] px-3 py-2 text-xs text-fg-muted">
                  <Icon name="audio" size={16} />
                  <span className="max-w-[180px] truncate">
                    {refPreview.path.split(/[\\/]/).pop()}
                  </span>
                </div>
              ) : (
                <img src={assetUrl(refPreview.path, refPreview.scope)} alt="" />
              )}
            </div>,
            document.body
          )
        : null}

      <MaskEditorDialog
        open={Boolean(maskEditor)}
        title="蒙版编辑"
        subtitle="涂抹要修改的区域，透明区域会交给模型编辑"
        src={maskEditor?.src ?? ''}
        imageWidth={maskEditor?.width ?? 1024}
        imageHeight={maskEditor?.height ?? 1024}
        onClose={() => setMaskEditor(null)}
        onConfirm={(mask) => {
          if (!maskEditor) return
          setMaskDraft({ dataUrl: mask, sourceKey: maskEditor.sourceKey })
          setMaskEditor(null)
        }}
      />
    </>
  )
}

