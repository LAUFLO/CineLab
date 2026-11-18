import { useEffect, useState } from 'react'
import type { SceneObjectPreset, SceneObjectShape } from '@shared/scene-object-presets'
import { builtinObjectPresets } from '@shared/scene-object-presets'
import { Button, Input, NativeSelect } from '../components/ui'

const SHAPES: SceneObjectShape[] = [
  'box',
  'sphere',
  'plane',
  'human',
  'crowd'
]

function emptyPreset(): SceneObjectPreset {
  return {
    name: `object_${Date.now().toString(36).slice(-4)}`,
    aliases: [],
    w: 1,
    d: 1,
    h: 1,
    color: '#9ca3af',
    shape: 'box'
  }
}

export function ObjectPresetsSection() {
  const [presets, setPresets] = useState<SceneObjectPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.scene
      .loadObjectPresets()
      .then((list) => {
        if (alive) setPresets(list)
      })
      .catch((error: unknown) => {
        if (alive) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const update = (
    index: number,
    patch: Partial<SceneObjectPreset>
  ): void => {
    setPresets((list) =>
      list.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    )
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await window.api.scene.saveObjectPresets(presets)
      setPresets(saved)
      setMessage(`已保存 ${saved.length} 个类别`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const importPresets = async (): Promise<void> => {
    try {
      const list = await window.api.scene.importObjectPresets()
      setPresets(list)
      setMessage(`已导入 ${list.length} 个类别`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const exportPresets = async (): Promise<void> => {
    try {
      const ok = await window.api.scene.exportObjectPresets()
      if (ok) setMessage('已导出')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const reset = async (): Promise<void> => {
    setSaving(true)
    try {
      const saved = await window.api.scene.saveObjectPresets([])
      setPresets(saved)
      setMessage('已恢复内置类别表')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-fg">物体类别表</h2>
        <p className="text-xs leading-relaxed text-fg-subtle">
          场景图生成白膜时，按这里的名称、别名和尺寸映射到盒子/球体/平面/人物/人群。
          用户表覆盖内置的 {builtinObjectPresets().length} 个类别。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setPresets((list) => [...list, emptyPreset()])}
        >
          添加类别
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void importPresets()}>
          导入 JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void exportPresets()}>
          导出 JSON
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void reset()}>
          恢复内置
        </Button>
      </div>

      {message ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-fg-muted">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-fg-subtle">正在读取类别表…</p>
      ) : presets.length === 0 ? (
        <p className="text-xs text-fg-subtle">
          还没有自定义类别；场景图会使用内置类别表。
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_0.8fr_0.9fr_1.2fr_auto] gap-2 px-1 text-[10px] text-fg-subtle">
            <span>名称</span>
            <span>宽</span>
            <span>深</span>
            <span>高</span>
            <span>颜色</span>
            <span>形状</span>
            <span>别名（逗号分隔）</span>
            <span />
          </div>
          {presets.map((preset, index) => (
            <div
              key={`${preset.name}-${index}`}
              className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_0.8fr_0.9fr_1.2fr_auto] items-center gap-2"
            >
              <Input
                value={preset.name}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
              <Input
                type="number"
                min={0.01}
                step={0.1}
                value={preset.w}
                onChange={(event) =>
                  update(index, { w: Number(event.target.value) || 0.01 })
                }
              />
              <Input
                type="number"
                min={0.01}
                step={0.1}
                value={preset.d}
                onChange={(event) =>
                  update(index, { d: Number(event.target.value) || 0.01 })
                }
              />
              <Input
                type="number"
                min={0.01}
                step={0.1}
                value={preset.h}
                onChange={(event) =>
                  update(index, { h: Number(event.target.value) || 0.01 })
                }
              />
              <Input
                value={preset.color}
                onChange={(event) =>
                  update(index, { color: event.target.value })
                }
              />
              <NativeSelect
                value={preset.shape}
                onChange={(event) =>
                  update(index, {
                    shape: event.target.value as SceneObjectShape
                  })
                }
              >
                {SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))}
              </NativeSelect>
              <Input
                value={preset.aliases.join(', ')}
                onChange={(event) =>
                  update(index, {
                    aliases: event.target.value
                      .split(',')
                      .map((alias) => alias.trim())
                      .filter(Boolean)
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setPresets((list) =>
                    list.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
