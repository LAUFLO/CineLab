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
import type { Capability, ModelDef, ParamDef } from '@shared/provider-schema'
import type { ReferenceInput, ReferenceRole } from '@shared/generation'
import { Icon } from '../components/Icon'
import {
  absolutePosition,
  isGroupNode,
  useCanvasStore
} from '../stores/canvas'
import { useGenerationStore } from '../stores/generation'
import { useLibraryStore } from '../stores/library'
import { usePreferencesStore } from '../stores/preferences'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { assetUrl } from '../lib/asset-url'

const WIDTH = 760
const HEIGHT = 132

const PLACEHOLDER: Record<NodeKind, string> = {
  text: '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。',
  image: '可直接文生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜',
  video: '描述你想要生成的画面内容，@引用素材',
  audio: '输入要朗读的文本，或描述想要的音乐'
}

interface ModelOption {
  key: string
  providerName: string
  model: ModelDef
}

function defaultParams(model: ModelDef): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const param of model.params) {
    if (param.defaultValue !== undefined) values[param.key] = param.defaultValue
  }
  return values
}

function paramLabel(param: ParamDef, value: unknown): string {
  if (param.type === 'boolean') {
    return value ? '开' : '关'
  }
  if (param.type === 'select') {
    return param.options?.find((option) => option.value === value)?.label ?? String(value ?? '')
  }
  return String(value ?? '')
}

function ratioOf(label: string): string | null {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(label.trim())
  return match ? `${match[1]} / ${match[2]}` : null
}

type MentionGroupName = '已引用' | '画布' | '资产库' | '角色'

interface MentionItem {
  key: string
  name: string
  group: MentionGroupName
  path?: string
  scope?: ReferenceInput['scope']
  refs?: ReferenceInput[]
  thumb?: string
}

const MENTION_GROUPS: MentionGroupName[] = ['已引用', '画布', '资产库', '角色']

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderMentionText(text: string, names: string[]): ReactNode[] {
  if (names.length === 0) return [text]

  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g')
  return text.split(pattern).map((part, index) => {
    const mentioned =
      part.startsWith('@') && names.some((name) => part === `@${name}`)

    return mentioned ? (
      <span key={index} className="promptbar__mention">
        {part}
      </span>
    ) : (
      part
    )
  })
}

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
  const [pickedRefs, setPickedRefs] = useState<ReferenceInput[]>([])
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
    single && !isGroupNode(single) && !single.data.assetOnly
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
      if (paramMenuKey && !target.closest('.param-picker')) setParamMenuKey(null)
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
      const outputs = source.data.outputs ?? []
      const output =
        outputs.find((item) => item.id === source?.data.selectedOutputId) ?? outputs[0]

      setPicking(false)
      if (!output) {
        setPickHint('该节点还没有输出')
        return
      }
      if (output.kind !== 'image') {
        setPickHint('只能引用图片输出')
        return
      }

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
                scope: output.scope
              }
            ]
      )
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPicking(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('is-picking')
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [picking, nodes, node?.id, onConnect])

  const models = useMemo<ModelOption[]>(() => {
    const matches = (capability: Capability): boolean => {
      if (kind === 'video') return capability === 'video.t2v'
      if (kind === 'image') return capability === 'image.t2i' || capability === 'image.i2i'
      if (kind === 'text') return capability === 'text.chat'
      if (kind === 'audio') return capability === 'audio.tts' || capability === 'audio.music'
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

  const active =
    models.find((item) => item.key === modelKey) ??
    models.find((item) => item.key === preferredModels[kind]) ??
    models[0] ??
    null
  const values = active ? { ...defaultParams(active.model), ...paramValues } : {}

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
        current[param.key] ??
        values[param.key] ??
        param.defaultValue ??
        ''
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
    const height = node.measured?.height ?? NODE_META[node.data.kind].height + TITLE_HEIGHT
    const zoom = viewport.zoom

    const left = Math.max(
      16,
      Math.min(position.x + (width * zoom) / 2 - WIDTH / 2, window.innerWidth - WIDTH - 16)
    )
    const top = Math.max(
      16,
      Math.min(position.y + height * zoom + 16, window.innerHeight - HEIGHT - 16)
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

  const handleRefClick = (ref: ReferenceInput): void => {
    if (refClickTimer.current) return
    refClickTimer.current = window.setTimeout(() => {
      refClickTimer.current = null
      removeRef(ref)
    }, 220)
  }

  const handleRefDoubleClick = (ref: ReferenceInput): void => {
    if (refClickTimer.current) {
      clearTimeout(refClickTimer.current)
      refClickTimer.current = null
    }

    const target = nodes.find(
      (entry) =>
        !isGroupNode(entry) &&
        (entry.data.outputs ?? []).some((output) => output.path === ref.path)
    )
    if (!target) return

    setRefPreview(null)
    void fitView({ nodes: [target], padding: 0.8, duration: 300, maxZoom: 1.5 })
  }

  const refs = (() => {
    const incoming = edges.filter((edge) => edge.target === node.id)
    const result: ReferenceInput[] = []
    let imageIndex = 0

    for (const edge of incoming) {
      const source = nodes.find((item) => item.id === edge.source)
      if (!source) continue

      const entries = isGroupNode(source)
        ? nodes.filter((item) => item.parentId === source.id)
        : [source]

      for (const entry of entries) {
        if (imageIndex >= 3) break
        if (isGroupNode(entry)) continue

        const outputs = entry.data.outputs ?? []
        const output =
          outputs.find((item) => item.id === entry.data.selectedOutputId) ??
          outputs[0]
        if (!output || output.kind !== 'image') continue

        const role: ReferenceRole =
          imageIndex === 0
            ? 'firstFrame'
            : imageIndex === 1
              ? 'lastFrame'
              : 'reference'
        result.push({ path: output.path, role, scope: output.scope })
        imageIndex += 1
      }
    }

    return result
  })()

  const autoRefs = (() => {
    if (!autoLink) return []
    const text = promptText.trim()
    if (!text) return []

    const result: ReferenceInput[] = []

    for (const item of nodes) {
      if (item.id === node.id || isGroupNode(item)) continue
      if (!text.includes(item.data.title)) continue
      const outputs = item.data.outputs ?? []
      const output =
        outputs.find((entry) => entry.id === item.data.selectedOutputId) ?? outputs[0]
      if (output?.kind === 'image') {
        result.push({
          path: output.path,
          role: 'reference',
          scope: output.scope
        })
      }
    }

    for (const material of materials) {
      if (material.kind !== 'image') continue
      if (!text.includes(material.name)) continue
      result.push({ path: material.path, role: 'reference', scope: 'global' })
    }

    for (const card of characters) {
      if (!text.includes(card.name)) continue
      for (const path of card.referencePaths) {
        result.push({ path, role: 'reference', scope: 'global' })
      }
    }

    return result
  })()

  const mergedRefs = (() => {
    const seen = new Set<string>()
    const result: ReferenceInput[] = []
    for (const ref of [...pickedRefs, ...autoRefs, ...refs]) {
      const key = `${ref.scope ?? 'project'}:${ref.path}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(ref)
      if (result.length >= 4) break
    }
    return result
  })()

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
      const outputs = entry.data.outputs ?? []
      const output =
        outputs.find((item) => item.id === entry.data.selectedOutputId) ?? outputs[0]
      if (!output || output.kind !== 'image') continue

      push({
        key: `node:${entry.id}`,
        name: entry.data.title,
        group: referenced.has(refKey(output)) ? '已引用' : '画布',
        path: output.path,
        scope: output.scope,
        thumb: output.path
      })
    }

    for (const material of materials) {
      if (material.kind !== 'image' && material.kind !== 'template') continue

      const ref = { path: material.path, scope: 'global' as const }
      push({
        key: `asset:${material.path}`,
        name: material.name,
        group: referenced.has(refKey(ref)) ? '已引用' : '资产库',
        path: material.path,
        scope: 'global',
        thumb: material.thumbnail ?? material.path
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
        refs
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

  const addRefs = (nextRefs: ReferenceInput[]): void => {
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

    const refsToAdd =
      item.refs ??
      (item.path
        ? [{ path: item.path, role: 'reference' as const, scope: item.scope }]
        : [])
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

  const handlePromptChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
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
  const canSend = Boolean(active) && promptText.trim().length > 0 && !isRunning

  const removeRef = (ref: ReferenceInput): void => {
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
      const outputs = source.data.outputs ?? []
      const output =
        outputs.find((item) => item.id === source.data.selectedOutputId) ?? outputs[0]
      return (
        output?.path === ref.path &&
        (output?.scope ?? 'project') === (ref.scope ?? 'project')
      )
    })
    if (linked.length > 0) {
      onEdgesChange(linked.map((edge) => ({ type: 'remove' as const, id: edge.id })))
    }
  }

  const handleSend = (): void => {
    if (!active || !canSend) return
    void runGeneration({
      nodeId: node.id,
      modelKey: active.key,
      prompt: promptText.trim(),
      params: { ...values, watermark },
      refs: mergedRefs.length > 0 ? mergedRefs : undefined
    })
  }

  return (
    <>
      {picking ? (
        <div className="canvas-pick-bar">
          <Icon name="frame" size={14} />
          <span>从画布选择节点作为参考</span>
          <span className="canvas-pick-bar__hint">Esc 退出</span>
          <button
            type="button"
            className="canvas-pick-bar__cancel"
            onClick={(event) => {
              event.stopPropagation()
              setPicking(false)
            }}
          >
            取消
          </button>
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
          <button
            type="button"
            className={`promptbar__tool ${uploadMenuOpen ? 'is-active' : ''}`}
            onClick={() => setUploadMenuOpen((open) => !open)}
          >
            <Icon name="plus" size={13} />
            上传
          </button>

          {uploadMenuOpen ? (
            <div className="promptbar__upload-menu">
              <button
                type="button"
                className="promptbar__upload-item"
                onClick={() => void handleLocalUpload()}
              >
                <Icon name="folder-plus" size={14} />
                本地上传
              </button>
              <button
                type="button"
                className="promptbar__upload-item"
                onClick={() => {
                  setUploadMenuOpen(false)
                  openLibrary('场景')
                }}
              >
                <Icon name="library" size={14} />
                资产库上传
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={`promptbar__tool ${picking ? 'is-active' : ''}`}
          onClick={() => {
            setPickHint(null)
            setPicking((open) => !open)
          }}
        >
          <Icon name="frame" size={13} />
          画布参考
        </button>
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
                <button
                  key={`${ref.scope ?? 'project'}:${ref.path}`}
                  type="button"
                  className={`promptbar__picked-item${
                    auto ? ' is-auto' : ''
                  }`}
                  onPointerEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setRefPreview({
                      path: ref.path,
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
                >
                  <img src={assetUrl(ref.path, ref.scope)} alt="" />
                  <Icon name="close" size={10} />
                </button>
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
          <span className="promptbar__refs" title="来自画布参考、上游连线与智能引用">
            素材 {mergedRefs.length}
          </span>
        ) : null}
        <button
          type="button"
          className="promptbar__icon"
          title={expanded ? '收起输入框' : '展开输入框'}
          onClick={() => setExpanded((open) => !open)}
        >
          <Icon name="expand" size={13} />
        </button>
      </div>

      <div className="promptbar__input-wrap">
        <div className="promptbar__mirror" ref={mirrorRef} aria-hidden>
          {renderMentionText(promptText, mentionNames)}
          {'\u200b'}
        </div>

        <textarea
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
                  return (current + delta + flatMentions.length) % flatMentions.length
                })
                return
              }

              if (event.key === 'Enter') {
                if (event.nativeEvent.isComposing) return
                event.preventDefault()
                const item =
                  flatMentions[Math.min(mentionIndex, flatMentions.length - 1)]
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
                      <button
                        key={item.key}
                        type="button"
                        className={`mention-menu__item${
                          index === mentionIndex ? ' is-active' : ''
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setMentionIndex(index)}
                        onClick={() => applyMention(item)}
                      >
                        <span className="mention-menu__thumb">
                          {item.thumb ? (
                            <img
                              src={assetUrl(item.thumb, item.scope)}
                              alt=""
                            />
                          ) : (
                            <Icon name="image" size={12} />
                          )}
                        </span>
                        <span className="mention-menu__name">{item.name}</span>
                        <span className="mention-menu__kind">
                          {item.group === '角色' ? '角色卡' : '图片'}
                        </span>
                      </button>
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
          <button type="button" className="promptbar__chip" onClick={() => openSettings('models')}>
            未配置模型
            <Icon name="chevron-down" size={11} />
          </button>
        ) : (
          <div className="model-picker">
            <button
              type="button"
              className="promptbar__chip"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {active?.model.name ?? '选择模型'}
              <Icon name="chevron-down" size={11} />
            </button>

            {menuOpen ? (
              <div className="model-menu">
                {models.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`model-menu__item ${
                      item.key === active?.key ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      setModelKey(item.key)
                      setParamValues({})
                      setMenuOpen(false)
                      void setDefaultModel(kind, item.key)
                    }}
                  >
                    <span>{item.model.name}</span>
                    <span className="model-menu__provider">{item.providerName}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {active ? (
          <div className="promptbar__param-group">
            <div className="param-picker">
              <button
                type="button"
                className="promptbar__chip promptbar__param-summary"
                onClick={() =>
                  setParamMenuKey((open) =>
                    open === '__all__' ? null : '__all__'
                  )
                }
                title="生成设置"
              >
                <span className="promptbar__param-summary-text">
                  {paramSummary || '生成设置'}
                </span>
                <Icon name="chevron-down" size={10} />
              </button>

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
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`param-panel__option${
                                      ratio
                                        ? ' param-panel__option--ratio'
                                        : ''
                                    }${
                                      String(option.value) ===
                                      String(values[param.key]) &&
                                      !custom
                                        ? ' is-active'
                                        : ''
                                    }`}
                                    onClick={() =>
                                      selectPreset(param, option.value)
                                    }
                                  >
                                    {ratio ? (
                                      <span
                                        className="param-panel__ratio"
                                        style={{ aspectRatio: ratio }}
                                      />
                                    ) : null}
                                    {option.label}
                                  </button>
                                )
                              })}

                              {allowCustom ? (
                                <button
                                  type="button"
                                  className={`param-panel__option param-panel__option--custom${
                                    custom ? ' is-active' : ''
                                  }`}
                                  onClick={() => enableCustomParam(param)}
                                >
                                  自定义
                                </button>
                              ) : null}

                              {custom ? (
                                <input
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
                                <button
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
                                >
                                  {value ? '开启' : '关闭'}
                                </button>
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
                              <input
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
                            <input
                              className="param-input nodrag nopan"
                              type={
                                param.type === 'number' ? 'number' : 'text'
                              }
                              value={String(values[param.key] ?? '')}
                              onChange={(event) => {
                                const raw = event.target.value
                                const next =
                                  param.type === 'number'
                                    ? Number(raw)
                                    : raw
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
                    <button
                      type="button"
                      className={`promptbar__switch ${watermark ? 'is-on' : ''}`}
                      onClick={() => {
                        const next = !watermark
                        setWatermark(next)
                        void updateGeneration({ watermark: next })
                      }}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <span className="promptbar__params">配置模型后生成参数会出现在这里</span>
        )}

        <div className="promptbar__spacer" />
        <button
          type="button"
          className={`promptbar__advanced-trigger ${advancedOpen ? 'is-active' : ''}`}
          title="高级设置"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <Icon name="settings" size={16} />
        </button>

        {isRunning ? (
          <button
            type="button"
            className="promptbar__send is-stop"
            title="停止生成"
            onClick={() => void cancelGeneration(node.id)}
          >
            <span className="promptbar__stop-icon" />
          </button>
        ) : (
          <button
            type="button"
            className="promptbar__send"
            disabled={!canSend}
            title="生成"
            onClick={handleSend}
          >
            <Icon name="arrow-up" size={15} />
          </button>
        )}
      </div>

      {advancedOpen ? (
        <div className="promptbar__advanced">
          <div className="promptbar__advanced-title">高级设置</div>
          <div className="promptbar__advanced-row">
            <div>
              <div className="promptbar__advanced-label">智能引用 AutoLink</div>
              <div className="promptbar__advanced-desc">
                自动匹配提示词中的节点、素材和角色名称，匹配结果会显示在素材缩略图中
              </div>
            </div>
            <button
              type="button"
              className={`promptbar__switch ${autoLink ? 'is-on' : ''}`}
              onClick={() => {
                const next = !autoLink
                setAutoLink(next)
                void updateGeneration({ autoLink: next })
              }}
            >
              <span />
            </button>
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
            <img
              src={assetUrl(refPreview.path, refPreview.scope)}
              alt=""
            />
          </div>,
          document.body
        )
      : null}
    </>
  )
}
