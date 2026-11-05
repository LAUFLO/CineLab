import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow, useViewport } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import type { Capability, ModelDef, ParamDef } from '@shared/provider-schema'
import type { ReferenceInput, ReferenceRole } from '@shared/generation'
import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useGenerationStore } from '../stores/generation'
import { useLibraryStore } from '../stores/library'
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
  if (param.type === 'select') {
    return param.options?.find((option) => option.value === value)?.label ?? String(value ?? '')
  }
  return String(value ?? '')
}

function ratioOf(label: string): string | null {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(label.trim())
  return match ? `${match[1]} / ${match[2]}` : null
}

export function PromptBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange)
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()

  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const openLibrary = useLibraryStore((state) => state.openPanel)
  const characters = useLibraryStore((state) => state.characters)
  const materials = useLibraryStore((state) => state.allAssets)
  const loadLibrary = useLibraryStore((state) => state.refresh)
  const pendingPrompt = useUIStore((state) => state.pendingPrompt)
  const clearPendingPrompt = useUIStore((state) => state.clearPendingPrompt)

  const runGeneration = useGenerationStore((state) => state.run)
  const cancelGeneration = useGenerationStore((state) => state.cancel)

  const [modelKey, setModelKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [characterMenuOpen, setCharacterMenuOpen] = useState(false)
  const [characterIds, setCharacterIds] = useState<string[]>([])
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})
  const [promptText, setPromptText] = useState('')
  const [paramMenuKey, setParamMenuKey] = useState<string | null>(null)
  const [pickedRefs, setPickedRefs] = useState<ReferenceInput[]>([])
  const [picking, setPicking] = useState(false)
  const [pickHint, setPickHint] = useState<string | null>(null)
  const [autoLink, setAutoLink] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [watermark, setWatermark] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const suppressClickRef = useRef(false)

  const selectedNodes = nodes.filter((item) => item.selected)
  const node = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const kind: NodeKind = node?.data.kind ?? 'image'
  const runningMap = useGenerationStore((state) => state.running)
  const runningRunId = node ? runningMap[node.id] : undefined

  useEffect(() => {
    setPromptText('')
    setMenuOpen(false)
    setCharacterMenuOpen(false)
    setCharacterIds([])
    setPickedRefs([])
    setPicking(false)
    setPickHint(null)
    setParamMenuKey(null)
    setExpanded(false)
  }, [node?.id])

  useEffect(() => {
    if (!pendingPrompt) return
    setPromptText(pendingPrompt)
    clearPendingPrompt()
  }, [pendingPrompt, clearPendingPrompt])

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
      const outputs = source?.data.outputs ?? []
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

  const active = models.find((item) => item.key === modelKey) ?? models[0] ?? null
  const values = active ? { ...defaultParams(active.model), ...paramValues } : {}

  const layout = useMemo(() => {
    if (!node) return null

    const position = flowToScreenPosition({ x: node.position.x, y: node.position.y })
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
  }, [node, flowToScreenPosition, viewport.x, viewport.y, viewport.zoom])

  if (!node || !layout) return null

  const refs = (() => {
    const incoming = edges.filter((edge) => edge.target === node.id)
    const result: ReferenceInput[] = []
    let imageIndex = 0

    for (const edge of incoming) {
      const source = nodes.find((item) => item.id === edge.source)
      const outputs = source?.data.outputs ?? []
      const output =
        outputs.find((item) => item.id === source?.data.selectedOutputId) ?? outputs[0]
      if (!output || output.kind !== 'image') continue

      const role: ReferenceRole =
        imageIndex === 0 ? 'firstFrame' : imageIndex === 1 ? 'lastFrame' : 'reference'
      result.push({ path: output.path, role, scope: output.scope })
      imageIndex += 1
      if (imageIndex >= 3) break
    }

    return result
  })()

  const characterRefs: ReferenceInput[] = characterIds.flatMap((id) => {
    const card = characters.find((item) => item.id === id)
    if (!card) return []
    return card.referencePaths.map((path) => ({
      path,
      role: 'reference' as const,
      scope: 'global' as const
    }))
  })
  const autoRefs = (() => {
    if (!autoLink) return []
    const text = promptText.trim()
    if (!text) return []

    const result: ReferenceInput[] = []

    for (const item of nodes) {
      if (item.id === node.id) continue
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
    for (const ref of [...pickedRefs, ...autoRefs, ...refs, ...characterRefs]) {
      const key = `${ref.scope ?? 'project'}:${ref.path}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(ref)
      if (result.length >= 4) break
    }
    return result
  })()

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
      const outputs = source?.data.outputs ?? []
      const output =
        outputs.find((item) => item.id === source?.data.selectedOutputId) ?? outputs[0]
      return (
        output?.path === ref.path &&
        (output?.scope ?? 'project') === (ref.scope ?? 'project')
      )
    })
    if (linked.length > 0) {
      onEdgesChange(linked.map((edge) => ({ type: 'remove' as const, id: edge.id })))
    }

    const character = characters.find(
      (card) =>
      characterIds.includes(card.id) && card.referencePaths.includes(ref.path)
    )
    if (character) {
      setCharacterIds((prev) => prev.filter((id) => id !== character.id))
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
            onClick={() => setPicking(false)}
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
        <button
          type="button"
          className="promptbar__tool"
          onClick={() => openLibrary('场景')}
        >
          <Icon name="plus" size={13} />
          上传
        </button>
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
        {kind === 'image' || kind === 'video' ? (
          <button
            type="button"
            className="promptbar__tool"
            onClick={() => openLibrary('角色')}
          >
            <Icon name="text" size={13} />
            角色库
          </button>
        ) : null}
        <button type="button" className="promptbar__tool">
          <Icon name="settings" size={13} />
          更多
        </button>
        <div className="promptbar__spacer" />
        {mergedRefs.length > 0 ? (
          <div className="promptbar__picked">
            {mergedRefs.map((ref) => (
              <button
                key={ref.path}
                type="button"
                className="promptbar__picked-item"
                title={`${ref.path}（点击移除）`}
                onClick={() => removeRef(ref)}
              >
                <img src={assetUrl(ref.path, ref.scope)} alt="" />
                <Icon name="close" size={10} />
              </button>
            ))}
          </div>
        ) : null}
        {mergedRefs.length > 0 ? (
          <span className="promptbar__refs" title="来自画布参考、上游连线与角色卡">
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

      <textarea
        className="promptbar__input"
        placeholder={PLACEHOLDER[kind]}
        rows={2}
        value={promptText}
        onChange={(event) => setPromptText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            handleSend()
          }
        }}
      />

      <div className="promptbar__footer">
        {models.length === 0 ? (
          <button type="button" className="promptbar__chip" onClick={openSettings}>
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

        {kind === 'image' || kind === 'video' ? (
          <div className="model-picker">
            <button
              type="button"
              className="promptbar__chip"
              onClick={() => {
                setCharacterMenuOpen((open) => !open)
                void loadLibrary()
              }}
            >
              角色{characterIds.length > 0 ? ` ${characterIds.length}` : ''}
              <Icon name="chevron-down" size={11} />
            </button>

            {characterMenuOpen ? (
              <div className="model-menu character-menu">
                {characters.length === 0 ? (
                  <div className="model-menu__empty">还没有角色卡</div>
                ) : (
                  characters.map((card) => {
                    const selected = characterIds.includes(card.id)

                    return (
                      <button
                        key={card.id}
                        type="button"
                        className={`model-menu__item ${
                          selected ? 'is-active' : ''
                        }`}
                        onClick={() =>
                          setCharacterIds((prev) =>
                            selected
                              ? prev.filter((id) => id !== card.id)
                              : [...prev, card.id]
                          )
                        }
                      >
                        <span>{card.name}</span>
                        <span className="model-menu__provider">
                          {card.referencePaths.length} 张参考图
                        </span>
                      </button>
                    )
                  })
                )}

                <button
                  type="button"
                  className="model-menu__item"
                  onClick={() => {
                    setCharacterMenuOpen(false)
                    openLibrary('characters')
                  }}
                >
                  管理角色库…
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {active ? (
          <div className="promptbar__param-group">
            {active.model.params.map((param) => (
              <div key={param.key} className="param-picker">
                <button
                  type="button"
                  className="promptbar__chip"
                  onClick={() => {
                    if (param.type !== 'select' || !param.options) return
                    setParamMenuKey((open) => (open === param.key ? null : param.key))
                  }}
                  title={param.label}
                >
                  <span className="promptbar__param-label">{param.label}</span>
                  {paramLabel(param, values[param.key])}
                  {param.type === 'select' ? (
                    <Icon name="chevron-down" size={10} />
                  ) : null}
                </button>

                {paramMenuKey === param.key && param.options ? (
                  <div
                    className={`param-menu ${
                      param.options.every((option) => ratioOf(option.label))
                        ? 'is-grid'
                        : ''
                    }`}
                  >
                    {param.options.map((option) => {
                      const ratio = ratioOf(option.label)

                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`param-menu__item ${
                            ratio ? 'param-menu__item--grid' : ''
                          } ${
                            String(option.value) === String(values[param.key])
                              ? 'is-active'
                              : ''
                          }`}
                          onClick={() => {
                            setParamValues((prev) => ({
                              ...prev,
                              [param.key]: option.value
                            }))
                            setParamMenuKey(null)
                          }}
                        >
                          {ratio ? (
                            <span
                              className="param-menu__ratio"
                              style={{ aspectRatio: ratio }}
                            />
                          ) : null}
                          {option.label}
                        </button>
                      )
                    })}
                    {param.options.every((option) => ratioOf(option.label)) ? (
                      <div className="param-menu__watermark">
                        <span>AI 水印</span>
                        <button
                          type="button"
                          className={`promptbar__switch ${watermark ? 'is-on' : ''}`}
                          onClick={() => setWatermark((open) => !open)}
                        >
                          <span />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
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
            <Icon name="stop" size={14} />
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
                自动匹配提示词中的节点、素材和角色名称
              </div>
            </div>
            <button
              type="button"
              className={`promptbar__switch ${autoLink ? 'is-on' : ''}`}
              onClick={() => setAutoLink((open) => !open)}
            >
              <span />
            </button>
          </div>
        </div>
      ) : null}
    </div>
    </>
  )
}
