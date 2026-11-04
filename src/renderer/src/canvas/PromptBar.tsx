import { useMemo, useState } from 'react'
import { useReactFlow, useViewport } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import type { ModelDef, ParamDef } from '@shared/provider-schema'
import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useSettingsStore } from '../stores/settings'

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
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()

  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const [modelKey, setModelKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})

  const models = useMemo<ModelOption[]>(
    () =>
      providers.flatMap((provider) =>
        provider.models.map((model) => ({
          key: `${provider.id}/${model.id}`,
          providerName: provider.name,
          model
        }))
      ),
    [providers]
  )

  const active = models.find((item) => item.key === modelKey) ?? models[0] ?? null
  const values = active ? { ...defaultParams(active.model), ...paramValues } : {}

  const node = nodes.find((item) => item.selected)

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

  const kind = node.data.kind

  const cycleParam = (param: ParamDef): void => {
    if (param.type !== 'select' || !param.options || param.options.length === 0) return
    const current = values[param.key]
    const index = param.options.findIndex((option) => option.value === current)
    const next = param.options[(index + 1) % param.options.length]
    setParamValues((prev) => ({ ...prev, [param.key]: next.value }))
  }

  return (
    <div
      className="promptbar"
      style={{ left: layout.left, top: layout.top, width: WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="promptbar__tools">
        <button type="button" className="promptbar__tool">
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
          <button type="button" className="promptbar__tool">
            <Icon name="text" size={13} />
            角色库
          </button>
        ) : null}
        <button type="button" className="promptbar__tool">
          <Icon name="settings" size={13} />
          更多
        </button>
        <div className="promptbar__spacer" />
        <button type="button" className="promptbar__icon" title="展开">
          <Icon name="maximize" size={12} />
        </button>
      </div>

      <textarea
        className="promptbar__input"
        placeholder={PLACEHOLDER[kind]}
        rows={2}
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
        <button type="button" className="promptbar__send" disabled title="M2-3 接入生成">
          <Icon name="arrow-up" size={15} />
        </button>
      </div>
    </div>
  )
}
