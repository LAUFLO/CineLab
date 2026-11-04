import { useEffect, useMemo, useState } from 'react'
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

export function PromptBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()

  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const openLibrary = useLibraryStore((state) => state.openPanel)
  const characters = useLibraryStore((state) => state.characters)
  const loadLibrary = useLibraryStore((state) => state.load)
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

  const node = nodes.find((item) => item.selected)
  const kind: NodeKind = node?.data.kind ?? 'image'
  const runningMap = useGenerationStore((state) => state.running)
  const runningRunId = node ? runningMap[node.id] : undefined

  useEffect(() => {
    setPromptText('')
    setMenuOpen(false)
    setCharacterMenuOpen(false)
    setCharacterIds([])
  }, [node?.id])

  useEffect(() => {
    if (!pendingPrompt) return
    setPromptText(pendingPrompt)
    clearPendingPrompt()
  }, [pendingPrompt, clearPendingPrompt])

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
      result.push({ path: output.path, role })
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
      role: 'reference' as const
    }))
  })
  const mergedRefs = [...refs, ...characterRefs].slice(0, 4)

  const isRunning = Boolean(runningRunId)
  const canSend = Boolean(active) && promptText.trim().length > 0 && !isRunning

  const cycleParam = (param: ParamDef): void => {
    if (param.type !== 'select' || !param.options || param.options.length === 0) return
    const current = values[param.key]
    const index = param.options.findIndex((option) => option.value === current)
    const next = param.options[(index + 1) % param.options.length]
    setParamValues((prev) => ({ ...prev, [param.key]: next.value }))
  }

  const handleSend = (): void => {
    if (!active || !canSend) return
    void runGeneration({
      nodeId: node.id,
      modelKey: active.key,
      prompt: promptText.trim(),
      params: values,
      refs: mergedRefs.length > 0 ? mergedRefs : undefined
    })
  }

  return (
    <div
      className="promptbar"
      style={{ left: layout.left, top: layout.top, width: WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="promptbar__tools">
        <button
          type="button"
          className="promptbar__tool"
          onClick={() => openLibrary('materials')}
        >
          <Icon name="plus" size={13} />
          上传
        </button>
        <button type="button" className="promptbar__tool">
          <Icon name="frame" size={13} />
          画布参考
        </button>
        {kind === 'image' ? (
          <button type="button" className="promptbar__tool">
            <Icon name="cursor" size={13} />
            标记
          </button>
        ) : null}
        {kind === 'image' || kind === 'video' ? (
          <button
            type="button"
            className="promptbar__tool"
            onClick={() => openLibrary('characters')}
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
          <span className="promptbar__refs" title="来自上游连线与角色卡">
            素材 {mergedRefs.length}
          </span>
        ) : null}
        <button type="button" className="promptbar__icon" title="展开">
          <Icon name="maximize" size={12} />
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
              <button
                key={param.key}
                type="button"
                className="promptbar__chip"
                onClick={() => cycleParam(param)}
                title={param.label}
              >
                <span className="promptbar__param-label">{param.label}</span>
                {paramLabel(param, values[param.key])}
                {param.type === 'select' ? (
                  <Icon name="chevron-down" size={10} />
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <span className="promptbar__params">配置模型后生成参数会出现在这里</span>
        )}

        <div className="promptbar__spacer" />
        <span className="promptbar__cost">—</span>

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
    </div>
  )
}
