import { useMemo, type ReactNode } from 'react'
import type { ModelDef } from '@shared/provider-schema'
import {
  AUTO_SAVE_DELAYS,
  GENERATION_CONCURRENCY,
  HISTORY_LIMITS,
  type CapabilityGroup
} from '@shared/preferences'
import { Select } from '../components/Select'
import { usePreferencesStore } from '../stores/preferences'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'

const MODEL_GROUPS: Array<{ key: CapabilityGroup; label: string }> = [
  { key: 'image', label: '图片模型' },
  { key: 'video', label: '视频模型' },
  { key: 'text', label: '文本模型' },
  { key: 'audio', label: '音频模型' }
]

function groupForCapability(
  capability: ModelDef['capability']
): CapabilityGroup | null {
  if (capability === 'image.t2i' || capability === 'image.i2i') return 'image'
  if (capability === 'video.t2v') return 'video'
  if (capability === 'text.chat') return 'text'
  if (capability === 'audio.tts' || capability === 'audio.music') return 'audio'
  return null
}

function SettingRow({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <div className="settings-row__title">{title}</div>
        {hint ? <div className="settings-row__hint">{hint}</div> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`settings-toggle${checked ? ' is-on' : ''}`}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function GeneralSettingsSection() {
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateStartup = usePreferencesStore((state) => state.updateStartup)
  const updateProject = usePreferencesStore((state) => state.updateProject)
  const updateCanvas = usePreferencesStore((state) => state.updateCanvas)
  const updateGeneration = usePreferencesStore(
    (state) => state.updateGeneration
  )
  const setDefaultModel = usePreferencesStore(
    (state) => state.setDefaultModel
  )
  const reset = usePreferencesStore((state) => state.reset)
  const providers = useSettingsStore((state) => state.providers)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const modelOptions = useMemo(() => {
    const groups: Record<CapabilityGroup, Array<{ value: string; label: string }>> = {
      image: [],
      video: [],
      text: [],
      audio: []
    }

    for (const provider of providers) {
      for (const model of provider.models) {
        const group = groupForCapability(model.capability)
        if (!group) continue
        groups[group].push({
          value: `${provider.id}/${model.id}`,
          label: `${provider.name} / ${model.name}`
        })
      }
    }

    for (const group of MODEL_GROUPS) {
      groups[group.key].unshift({
        value: '',
        label: '自动（最近使用 / 第一个可用）'
      })
    }

    return groups
  }, [providers])

  const autoSaveOptions = AUTO_SAVE_DELAYS.map((value) => ({
    value: String(value),
    label: value < 1000 ? `${value} 毫秒` : `${value / 1000} 秒`
  }))

  const concurrencyOptions = GENERATION_CONCURRENCY.map((value) => ({
    value: String(value),
    label: `${value} 个`
  }))

  const historyOptions = HISTORY_LIMITS.map((value) => ({
    value: String(value),
    label: value === 0 ? '不保留历史' : `${value} 条`
  }))

  return (
    <div className="settings-section">
      <div className="settings-group-title">启动与项目</div>
      <div className="settings-group">
        <SettingRow
          title="启动时打开最近项目"
          hint="关闭后启动进入项目中心，不自动打开上次的项目"
        >
          <Toggle
            checked={preferences.startup.openRecentProject}
            onChange={(next) => void updateStartup({ openRecentProject: next })}
          />
        </SettingRow>

        <SettingRow
          title="自动保存间隔"
          hint="画布变化后延迟多久写入磁盘"
        >
          <Select
            value={String(preferences.project.autoSaveDelay)}
            options={autoSaveOptions}
            onChange={(next) => void updateProject({ autoSaveDelay: Number(next) })}
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">画布与交互</div>
      <div className="settings-group">
        <SettingRow title="网格吸附" hint="拖动节点时按 16px 网格对齐">
          <Toggle
            checked={preferences.canvas.snapToGrid}
            onChange={(next) => void updateCanvas({ snapToGrid: next })}
          />
        </SettingRow>

        <SettingRow title="显示小地图" hint="在画布左下角显示节点缩略图">
          <Toggle
            checked={preferences.canvas.minimapVisible}
            onChange={(next) => void updateCanvas({ minimapVisible: next })}
          />
        </SettingRow>

        <SettingRow title="减少动效" hint="关闭菜单、面板和提示的过渡动画">
          <Toggle
            checked={preferences.canvas.reduceMotion}
            onChange={(next) => void updateCanvas({ reduceMotion: next })}
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">生成与提示词</div>
      <div className="settings-group">
        {MODEL_GROUPS.map((group) => (
          <SettingRow
            key={group.key}
            title={`默认${group.label}`}
            hint="不指定时使用最近一次选择的模型"
          >
            <Select
              value={preferences.generation.defaultModels[group.key] ?? ''}
              options={modelOptions[group.key]}
              onChange={(next) => void setDefaultModel(group.key, next || null)}
            />
          </SettingRow>
        ))}

        <SettingRow title="生成并发数" hint="同时进行的生成任务数量">
          <Select
            value={String(preferences.generation.concurrency)}
            options={concurrencyOptions}
            onChange={(next) =>
              void updateGeneration({ concurrency: Number(next) })
            }
          />
        </SettingRow>

        <SettingRow
          title="智能引用 AutoLink"
          hint="默认开启提示词中的节点、素材和角色自动匹配"
        >
          <Toggle
            checked={preferences.generation.autoLink}
            onChange={(next) => void updateGeneration({ autoLink: next })}
          />
        </SettingRow>

        <SettingRow
          title="生成历史保留"
          hint="只影响本地历史记录，不删除已生成素材"
        >
          <Select
            value={String(preferences.generation.historyLimit)}
            options={historyOptions}
            onChange={(next) =>
              void updateGeneration({ historyLimit: Number(next) })
            }
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">通知</div>
      <div className="settings-group">
        <SettingRow
          title="生成完成通知"
          hint="窗口不在前台时，生成完成会发送系统通知"
        >
          <Toggle
            checked={preferences.generation.notifyOnComplete}
            onChange={(next) =>
              void updateGeneration({ notifyOnComplete: next })
            }
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">存储与数据</div>
      <div className="settings-group">
        <SettingRow
          title="数据目录"
          hint="包含 models.json、settings.json、preferences.json 和日志"
        >
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void window.api.settings.openDataDir()}
          >
            打开目录
          </button>
        </SettingRow>
      </div>

      <div className="settings-group-title">高级</div>
      <div className="settings-group">
        <SettingRow
          title="重置通用设置"
          hint="恢复默认值；模型配置和资产库路径不受影响"
        >
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              requestConfirm({
                title: '重置通用设置',
                message:
                  '所有通用设置将恢复默认值。模型配置、资产库路径和项目文件不受影响。',
                confirmLabel: '重置',
                danger: true,
                onConfirm: async () => {
                  await reset()
                }
              })
            }
          >
            重置
          </button>
        </SettingRow>
      </div>
    </div>
  )
}
