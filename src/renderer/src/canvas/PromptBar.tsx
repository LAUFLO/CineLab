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
  missingInputsFor,
  type Capability,
  type MediaInput,
  type ModelDef,
  type ParamDef
} from '@shared/provider-schema'
import type { ReferenceInput, ReferenceRole } from '@shared/generation'
import { Icon } from '../components/Icon'
import {
  IconButton,
  Input,
  MenuItem,
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
      if (target.closest('.promptbar__input-wrap')) return
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
        !target.closest('.promptbar__advanced') &&
        !target.closest('.promptbar__advanced-trigger')
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

    document.body.classList.add('is-picking')

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
      document.body.classList.remove('is-picking')
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
  const values = active
    ? { ...defaultParams(active.model), ...paramValues }
    : {}

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
    for (const param of active.model.params) {
      const name = param.group?.trim() || '其它'
      const list = groups.get(name) ?? []
      list.push(param)
      groups.set(name, list)
    }
    return [...groups.entries()].map(([name, params]) => ({ name, params }))
  }, [active])

  const paramSummary = active
    ? active.model.params
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

  const handleRefClick = (ref: PickedRef): void => {
    if (refClickTimer.current) return
    refClickTimer.current = window.setTimeout(() => {
      refClickTimer.current = null
      removeRef(ref)
    }, 220)
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

  const refs = (() => {
    const incoming = edges.filter((edge) => edge.target === node.id)
    const images: PickedRef[] = []
    const videos: PickedRef[] = []
    let imageIndex = 0

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
          }
          continue
        }

        if (output.kind !== 'image') continue
        if (imageIndex >= 3) continue

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

    return [...images, ...videos]
  })()

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

  const mergedRefs = (() => {
    const seen = new Set<string>()
    const result: PickedRef[] = []
    let imageCount = 0
    let videoCount = 0

    for (const ref of [...pickedRefs, ...autoRefs, ...refs]) {
      const key = `${ref.scope ?? 'project'}:${ref.path}`
      if (seen.has(key)) continue

      if (ref.kind === 'video') {
        if (videoCount >= 1) continue
        videoCount += 1
      } else {
        if (imageCount >= 4) continue
        imageCount += 1
      }

      seen.add(key)
      result.push(ref)
    }

    return result
  })()

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

  const activeMissing = active
    ? missingInputsFor(active.model, requiredInputs)
    : []

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

  const removeRef = (ref: PickedRef): void => {
    setPickedRefs((prev) =>
      prev.filter(
        (item) =>
          !(
            item.path === ref.path &&
            (item.scope ?? 'project') === (ref.scope ?? 'project')
          )
      )
    )

    const linked = edges.filter((edge) => {
      if (edge.target !== node.id) return false
      const source = nodes.find((item) => item.id === edge.source)
      if (!source || isGroupNode(source)) return false
      const output = selectedNodeOutput(source)
      return (
        output?.path === ref.path &&
        (output?.scope ?? 'project') === (ref.scope ?? 'project')
      )
    })
    if (linked.length > 0) {
      onEdgesChange(
        linked.map((edge) => ({ type: 'remove' as const, id: edge.id }))
      )
    }
  }

  const handleSend = (): void => {
    if (!active || !canSend) return

    if (activeMissing.length > 0) {
      showToast(
        `当前模型不支持${inputLabel(activeMissing)}输入，请更换模型`,
        'error'
      )
      return
    }

    const videoRef = mergedRefs.find((ref) => ref.kind === 'video')
    if (videoRef && kind !== 'video') {
      showToast('图片节点不能引用视频，请改用视频节点', 'error')
      return
    }
    if (videoRef) {
      const adapter =
        active.model.adapter ??
        (/^agnes-video/i.test(active.model.remoteModel) ? 'agnes-video' : '')
      if (adapter !== 'http-template') {
        showToast(
          '当前模型不支持参考视频，请先在设置 → 操作模型绑定 http-template 专用接口',
          'error'
        )
        return
      }
    }

    const imageRefs: ReferenceInput[] = mergedRefs
      .filter((ref) => ref.kind === 'image')
      .map((ref) => ({
        path: ref.path,
        role: ref.role,
        scope: ref.scope
      }))

    void runGeneration({
      nodeId: node.id,
      modelKey: active.key,
      prompt: buildPromptWithContext(promptText.trim(), textContexts),
      params: { ...values, watermark },
      ...(imageRefs.length > 0 ? { refs: imageRefs } : {}),
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
        <div className="canvas-pick-bar">
          <Icon name="frame" size={14} />
          <span>从画布选择节点作为参考</span>
          <span className="canvas-pick-bar__hint">Esc 退出</span>
          <Button
            type="button"
            className="canvas-pick-bar__cancel"
            onClick={(event) => {
              event.stopPropagation()
              setPicking(false)
            }}
            unstyled
          >
            取消
          </Button>
        </div>
      ) : null}

      <div
        className={`promptbar ${expanded ? 'is-expanded' : ''}`}
        style={
          expanded
            ? undefined
            : { left: layout.left, top: layout.top, width: WIDTH }
        }
        onPointerDown={(event) => event.stopPropagation()}
      >
        {pickHint ? (
          <div className="promptbar__pick-hint is-warn">{pickHint}</div>
        ) : null}

        <div className="promptbar__tools">
          <div className="promptbar__upload-wrap" ref={uploadRef}>
            <Button
              type="button"
              className={`promptbar__tool ${uploadMenuOpen ? 'is-active' : ''}`}
              onClick={() => setUploadMenuOpen((open) => !open)}
              unstyled
            >
              <Icon name="plus" size={13} />
              上传
            </Button>

            {uploadMenuOpen ? (
              <div className="promptbar__upload-menu">
                <MenuItem
                  className="promptbar__upload-item"
                  icon={<Icon name="folder-plus" size={14} />}
                  onSelect={() => void handleLocalUpload()}
                >
                  本地上传
                </MenuItem>
                <MenuItem
                  className="promptbar__upload-item"
                  icon={<Icon name="library" size={14} />}
                  onSelect={() => {
                    setUploadMenuOpen(false)
                    openLibrary('场景')
                  }}
                >
                  资产库上传
                </MenuItem>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            className={`promptbar__tool ${picking ? 'is-active' : ''}`}
            onClick={() => {
              setPickHint(null)
              setPicking((open) => !open)
            }}
            unstyled
          >
            <Icon name="frame" size={13} />
            画布参考
          </Button>
          <div className="promptbar__spacer" />
          {mergedRefs.length > 0 ? (
            <div className="promptbar__picked">
              {mergedRefs.map((ref) => {
                const auto = autoRefs.some(
                  (item) =>
                    item.path === ref.path &&
                    (item.scope ?? 'project') === (ref.scope ?? 'project')
                )

                return (
                  <Button
                    key={`${ref.scope ?? 'project'}:${ref.path}`}
                    type="button"
                    className={`promptbar__picked-item${
                      auto ? ' is-auto' : ''
                    }`}
                    onPointerEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setRefPreview({
                        path: ref.path,
                        kind: ref.kind,
                        scope: ref.scope,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8
                      })
                    }}
                    onPointerLeave={() => setRefPreview(null)}
                    onClick={() => handleRefClick(ref)}
                    onDoubleClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      handleRefDoubleClick(ref)
                    }}
                    unstyled
                  >
                    {ref.kind === 'video' ? (
                      <video
                        src={`${assetUrl(ref.path, ref.scope)}#t=0.1`}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img src={assetUrl(ref.path, ref.scope)} alt="" />
                    )}
                    <Icon name="close" size={10} />
                  </Button>
                )
              })}
            </div>
          ) : null}
          {autoRefs.length > 0 ? (
            <span
              className="promptbar__autolink"
              title="智能引用 AutoLink 自动匹配的素材，可在高级设置中关闭"
            >
              <Icon name="sparkles" size={10} />
              AutoLink {autoRefs.length}
            </span>
          ) : null}
          {mergedRefs.length > 0 ? (
            <span
              className="promptbar__refs"
              title="来自画布参考、上游连线与智能引用"
            >
              素材 {mergedRefs.length}
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

        <div className="promptbar__input-wrap">
          <div className="promptbar__mirror" ref={mirrorRef} aria-hidden>
            {renderMentionText(promptText, mentionNames)}
            {'\u200b'}
          </div>

          <Textarea
            ref={inputRef}
            className="promptbar__input"
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
            unstyled
          />

          {mentionOpen ? (
            <div className="mention-menu">
              <div className="mention-menu__head">
                <Icon name="search" size={12} />
                <span>{mentionQuery || '搜索画布、资产库和角色'}</span>
              </div>

              <div className="mention-menu__list">
                {mentionGroups.map((group) => (
                  <div className="mention-menu__section" key={group.name}>
                    <div className="mention-menu__title">{group.name}</div>

                    {group.items.map((item) => {
                      const index = flatMentions.findIndex(
                        (entry) => entry.key === item.key
                      )

                      return (
                        <MenuItem
                          key={item.key}
                          className="mention-menu__item"
                          icon={
                            <span className="mention-menu__thumb">
                              {item.thumb ? (
                                item.kind === 'video' &&
                                isVideoPath(item.thumb) ? (
                                  <video
                                    src={`${assetUrl(item.thumb, item.scope)}#t=0.1`}
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : (
                                  <img
                                    src={assetUrl(item.thumb, item.scope)}
                                    alt=""
                                  />
                                )
                              ) : (
                                <Icon
                                  name={
                                    item.kind === 'video' ? 'video' : 'image'
                                  }
                                  size={12}
                                />
                              )}
                            </span>
                          }
                          active={index === mentionIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setMentionIndex(index)}
                          onSelect={() => applyMention(item)}
                          trailing={
                            <span className="mention-menu__kind">
                              {item.group === '角色'
                                ? '角色卡'
                                : item.kind === 'video'
                                  ? '视频'
                                  : '图片'}
                            </span>
                          }
                        >
                          <span className="mention-menu__name">
                            {item.name}
                          </span>
                        </MenuItem>
                      )
                    })}
                  </div>
                ))}

                {flatMentions.length === 0 ? (
                  <div className="mention-menu__empty">没有匹配的素材</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="promptbar__footer">
          {models.length === 0 ? (
            <Button
              type="button"
              className="promptbar__chip"
              onClick={() => openSettings('models')}
              unstyled
            >
              未配置模型
              <Icon name="chevron-down" size={11} />
            </Button>
          ) : (
            <div className="model-picker">
              <Button
                type="button"
                className={`promptbar__chip${
                  activeMissing.length > 0 ? ' is-warning' : ''
                }`}
                title={
                  activeMissing.length > 0
                    ? `当前模型不支持${inputLabel(activeMissing)}输入`
                    : undefined
                }
                onClick={() => setMenuOpen((open) => !open)}
                unstyled
              >
                {active?.model.name ?? '选择模型'}
                {activeMissing.length > 0 ? (
                  <span className="promptbar__model-warning">
                    不支持{inputLabel(activeMissing)}
                  </span>
                ) : null}
                <Icon name="chevron-down" size={11} />
              </Button>

              {menuOpen ? (
                <div className="model-menu">
                  {models.map((item) => {
                    const missing = missingInputsFor(item.model, requiredInputs)
                    const unavailable = missing.length > 0

                    return (
                      <MenuItem
                        key={item.key}
                        active={item.key === active?.key}
                        className={`model-menu__item ${
                          unavailable ? 'is-disabled' : ''
                        }`}
                        title={
                          unavailable
                            ? `该模型不支持${inputLabel(missing)}输入`
                            : undefined
                        }
                        onSelect={() => {
                          if (unavailable) {
                            showToast(
                              `「${item.model.name}」不支持${inputLabel(missing)}输入`,
                              'error'
                            )
                            return
                          }

                          setModelKey(item.key)
                          setParamValues({})
                          setMenuOpen(false)
                          void setDefaultModel(capabilityGroup, item.key)
                        }}
                        trailing={
                          <span className="flex flex-col items-end gap-0.5">
                            {unavailable ? (
                              <span className="model-menu__reason">
                                不支持
                                {missing
                                  .map((input) => MEDIA_INPUT_LABEL[input])
                                  .join('·')}
                              </span>
                            ) : null}
                            <span className="model-menu__provider">
                              {item.providerName}
                            </span>
                          </span>
                        }
                      >
                        <span className="model-menu__name">
                          {item.model.name}
                        </span>
                      </MenuItem>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )}

          {active ? (
            <div className="promptbar__param-group">
              <div className="param-picker">
                <Button
                  type="button"
                  className="promptbar__chip promptbar__param-summary"
                  onClick={() =>
                    setParamMenuKey((open) =>
                      open === '__all__' ? null : '__all__'
                    )
                  }
                  title="生成设置"
                  unstyled
                >
                  <span className="promptbar__param-summary-text">
                    {paramSummary || '生成设置'}
                  </span>
                  <Icon name="chevron-down" size={10} />
                </Button>

                {paramMenuKey === '__all__' ? (
                  <div className="param-panel">
                    {paramGroups.map((group) => (
                      <div className="param-panel__section" key={group.name}>
                        <div className="param-panel__title">{group.name}</div>

                        {group.params.map((param) => {
                          if (param.type === 'select' && param.options) {
                            const ratioGrid = param.options.every((option) =>
                              ratioOf(option.label)
                            )
                            const custom = isParamCustom(param)
                            const allowCustom = paramAllowsCustom(param)

                            return (
                              <div
                                key={param.key}
                                className={`param-panel__grid${ratioGrid ? ' is-ratio' : ''}`}
                              >
                                {param.options.map((option) => {
                                  const ratio = ratioOf(option.label)

                                  return (
                                    <Button
                                      key={option.value}
                                      type="button"
                                      className={`param-panel__option${
                                        ratio
                                          ? ' param-panel__option--ratio'
                                          : ''
                                      }${
                                        String(option.value) ===
                                          String(values[param.key]) && !custom
                                          ? ' is-active'
                                          : ''
                                      }`}
                                      onClick={() =>
                                        selectPreset(param, option.value)
                                      }
                                      unstyled
                                    >
                                      {ratio ? (
                                        <span
                                          className="param-panel__ratio"
                                          style={{ aspectRatio: ratio }}
                                        />
                                      ) : null}
                                      {option.label}
                                    </Button>
                                  )
                                })}

                                {allowCustom ? (
                                  <Button
                                    type="button"
                                    className={`param-panel__option param-panel__option--custom${
                                      custom ? ' is-active' : ''
                                    }`}
                                    onClick={() => enableCustomParam(param)}
                                    unstyled
                                  >
                                    自定义
                                  </Button>
                                ) : null}

                                {custom ? (
                                  <Input
                                    className="param-panel__custom-input"
                                    value={String(values[param.key] ?? '')}
                                    placeholder={
                                      param.key === 'ratio'
                                        ? '例如 2:1'
                                        : param.key === 'size'
                                          ? '例如 2048x1152'
                                          : '输入自定义值'
                                    }
                                    onChange={(event) =>
                                      setParamValues((current) => ({
                                        ...current,
                                        [param.key]: event.target.value
                                      }))
                                    }
                                  />
                                ) : null}
                              </div>
                            )
                          }

                          if (param.type === 'boolean') {
                            return (
                              <div
                                key={param.key}
                                className="param-panel__grid is-two"
                              >
                                {[true, false].map((value) => (
                                  <Button
                                    key={String(value)}
                                    type="button"
                                    className={`param-panel__option${
                                      Boolean(values[param.key]) === value
                                        ? ' is-active'
                                        : ''
                                    }`}
                                    onClick={() =>
                                      setParamValues((prev) => ({
                                        ...prev,
                                        [param.key]: value
                                      }))
                                    }
                                    unstyled
                                  >
                                    {value ? '开启' : '关闭'}
                                  </Button>
                                ))}
                              </div>
                            )
                          }

                          if (
                            param.key === 'duration' &&
                            param.type === 'number'
                          ) {
                            const value = Number(
                              values[param.key] ?? param.defaultValue ?? 5
                            )

                            return (
                              <div
                                key={param.key}
                                className="param-panel__range"
                              >
                                <Input
                                  type="range"
                                  min={param.min ?? 1}
                                  max={param.max ?? 30}
                                  step={1}
                                  value={value}
                                  onChange={(event) =>
                                    setParamValues((prev) => ({
                                      ...prev,
                                      [param.key]: Number(event.target.value)
                                    }))
                                  }
                                  unstyled
                                />
                                <span className="param-panel__range-value">
                                  {value}s
                                </span>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={param.key}
                              className="param-panel__input-row"
                            >
                              <span>{param.label}</span>
                              <Input
                                className="param-input nodrag nopan"
                                type={
                                  param.type === 'number' ? 'number' : 'text'
                                }
                                value={String(values[param.key] ?? '')}
                                onChange={(event) => {
                                  const raw = event.target.value
                                  const next =
                                    param.type === 'number' ? Number(raw) : raw
                                  if (
                                    param.type === 'number' &&
                                    !Number.isFinite(next as number)
                                  ) {
                                    return
                                  }
                                  setParamValues((prev) => ({
                                    ...prev,
                                    [param.key]: next
                                  }))
                                }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ))}

                    <div className="param-panel__switch-row">
                      <span>AI 水印</span>
                      <Switch
                        label="AI 水印"
                        size="sm"
                        checked={watermark}
                        onChange={(next) => {
                          setWatermark(next)
                          void updateGeneration({ watermark: next })
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="promptbar__params">
              配置模型后生成参数会出现在这里
            </span>
          )}

          <div className="promptbar__spacer" />
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
              className="promptbar__send is-stop"
              onClick={() => void cancelGeneration(node.id)}
            >
              <span className="promptbar__stop-icon" />
            </IconButton>
          ) : (
            <IconButton
              label="生成"
              size="sm"
              className="promptbar__send"
              disabled={!canSend}
              onClick={handleSend}
            >
              <Icon name="arrow-up" size={15} />
            </IconButton>
          )}
        </div>

        {advancedOpen ? (
          <div className="promptbar__advanced">
            <div className="promptbar__advanced-title">高级设置</div>
            <div className="promptbar__advanced-row">
              <div>
                <div className="promptbar__advanced-label">
                  智能引用 AutoLink
                </div>
                <div className="promptbar__advanced-desc">
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

      {refPreview
        ? createPortal(
            <div
              className="ref-preview"
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
              ) : (
                <img src={assetUrl(refPreview.path, refPreview.scope)} alt="" />
              )}
            </div>,
            document.body
          )
        : null}
    </>
  )
}

