import { useEffect, useMemo, useState } from 'react'
import type { ModelDef } from '@shared/provider-schema'
import type { ThumbCacheInfo } from '@shared/library-schema'
import {
  AUTO_RETRY_COUNTS,
  AUTO_SAVE_DELAYS,
  CACHE_CLEAN_DAYS,
  GENERATION_CONCURRENCY,
  HISTORY_LIMITS,
  REQUEST_TIMEOUTS,
  UI_SCALES,
  type CapabilityGroup,
  type Preferences
} from '@shared/preferences'
import { Input, Select, SettingRow, Switch, Button } from '../components/ui'
import { useGenerationHistoryStore } from '../stores/generation-history'
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function GeneralSettingsSection() {
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateStartup = usePreferencesStore((state) => state.updateStartup)
  const updateProject = usePreferencesStore((state) => state.updateProject)
  const updateCanvas = usePreferencesStore((state) => state.updateCanvas)
  const updateGeneration = usePreferencesStore(
    (state) => state.updateGeneration
  )
  const updateUpdates = usePreferencesStore((state) => state.updateUpdates)
  const updateStorage = usePreferencesStore((state) => state.updateStorage)
  const updateUi = usePreferencesStore((state) => state.updateUi)
  const updateNetwork = usePreferencesStore((state) => state.updateNetwork)
  const setDefaultModel = usePreferencesStore((state) => state.setDefaultModel)
  const refreshPreferences = usePreferencesStore((state) => state.refresh)
  const reset = usePreferencesStore((state) => state.reset)
  const providers = useSettingsStore((state) => state.providers)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)
  const historyCount = useGenerationHistoryStore(
    (state) => state.entries.length
  )

  const [thumbInfo, setThumbInfo] = useState<ThumbCacheInfo | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)
  const [ioBusy, setIoBusy] = useState(false)
  const [proxyDraft, setProxyDraft] = useState(preferences.network.proxyUrl)

  useEffect(() => {
    void window.api.library.thumbCacheInfo().then(setThumbInfo)
  }, [])

  useEffect(() => {
    setProxyDraft(preferences.network.proxyUrl)
  }, [preferences.network.proxyUrl])

  const modelOptions = useMemo(() => {
    const groups: Record<
      CapabilityGroup,
      Array<{ value: string; label: string }>
    > = {
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

  const retryOptions = AUTO_RETRY_COUNTS.map((value) => ({
    value: String(value),
    label: value === 0 ? '不重试' : `${value} 次`
  }))

  const scaleOptions = UI_SCALES.map((value) => ({
    value: String(value),
    label: `${value}%`
  }))

  const cacheOptions = CACHE_CLEAN_DAYS.map((value) => ({
    value: String(value),
    label: value === 0 ? '不清理' : `${value} 天`
  }))

  const timeoutOptions = REQUEST_TIMEOUTS.map((value) => ({
    value: String(value),
    label: value < 60000 ? `${value / 1000} 秒` : `${value / 60000} 分钟`
  }))

  const scrollModeOptions: Array<{
    value: Preferences['canvas']['scrollMode']
    label: string
  }> = [
    { value: 'pan', label: '滚轮平移画布' },
    { value: 'zoom', label: '滚轮缩放画布' }
  ]

  const gridStyleOptions: Array<{
    value: Preferences['canvas']['gridStyle']
    label: string
  }> = [
    { value: 'dots', label: '点阵' },
    { value: 'lines', label: '线格' },
    { value: 'none', label: '不显示' }
  ]

  const updateChannelOptions: Array<{
    value: Preferences['updates']['channel']
    label: string
  }> = [
    { value: 'stable', label: '稳定版' },
    { value: 'beta', label: '测试版' }
  ]

  const proxyModeOptions: Array<{
    value: Preferences['network']['proxyMode']
    label: string
  }> = [
    { value: 'direct', label: '直连' },
    { value: 'system', label: '跟随系统' },
    { value: 'manual', label: '手动代理' }
  ]

  const clearThumbCache = async (): Promise<void> => {
    setCacheBusy(true)
    try {
      const removed = await window.api.library.clearThumbCache()
      setThumbInfo({ bytes: 0, files: 0 })
      showToast(`已清理缩略图缓存 ${formatBytes(removed.bytes)}`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setCacheBusy(false)
    }
  }

  const chooseProjectDir = async (): Promise<void> => {
    const dir = await window.api.settings.chooseProjectDir()
    if (dir) void updateProject({ defaultDir: dir })
  }

  const exportPreferences = async (): Promise<void> => {
    setIoBusy(true)
    try {
      const result = await window.api.settings.exportPreferences()
      if (result.path) showToast('通用设置已导出')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIoBusy(false)
    }
  }

  const importPreferences = async (): Promise<void> => {
    setIoBusy(true)
    try {
      const imported = await window.api.settings.importPreferences()
      if (imported) {
        await refreshPreferences()
        showToast('通用设置已导入')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIoBusy(false)
    }
  }

  const projectDir = preferences.project.defaultDir || '文档 / CineLab（默认）'

  return (
    <div className="settings-section">
      <div className="settings-group-title">启动与项目</div>
      <div className="settings-group">
        <SettingRow
          title="启动时打开最近项目"
          hint="关闭后启动进入项目中心，不自动打开上次的项目"
        >
          <Switch
            checked={preferences.startup.openRecentProject}
            onChange={(next) => void updateStartup({ openRecentProject: next })}
          />
        </SettingRow>

        <SettingRow title="自动保存间隔" hint="画布变化后延迟多久写入磁盘">
          <Select
            value={String(preferences.project.autoSaveDelay)}
            options={autoSaveOptions}
            onChange={(next) =>
              void updateProject({ autoSaveDelay: Number(next) })
            }
          />
        </SettingRow>

        <SettingRow
          title="关闭前确认"
          hint="有未保存修改时先提示，并在退出前保存"
        >
          <Switch
            checked={preferences.project.confirmBeforeClose}
            onChange={(next) =>
              void updateProject({ confirmBeforeClose: next })
            }
          />
        </SettingRow>

        <SettingRow title="默认项目目录" hint="新建项目时的默认位置">
          <div className="settings-path-control">
            <code title={projectDir}>{projectDir}</code>
            <Button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => void chooseProjectDir()}
              unstyled
            >
              选择
            </Button>
            {preferences.project.defaultDir ? (
              <Button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void updateProject({ defaultDir: '' })}
                unstyled
              >
                恢复默认
              </Button>
            ) : null}
          </div>
        </SettingRow>
      </div>

      <div className="settings-group-title">画布与交互</div>
      <div className="settings-group">
        <SettingRow title="网格吸附" hint="拖动节点时按 16px 网格对齐">
          <Switch
            checked={preferences.canvas.snapToGrid}
            onChange={(next) => void updateCanvas({ snapToGrid: next })}
          />
        </SettingRow>

        <SettingRow title="显示连线" hint="关闭后隐藏所有节点连线">
          <Switch
            checked={preferences.canvas.edgesVisible}
            onChange={(next) => void updateCanvas({ edgesVisible: next })}
          />
        </SettingRow>

        <SettingRow title="显示小地图" hint="在画布左下角显示节点缩略图">
          <Switch
            checked={preferences.canvas.minimapVisible}
            onChange={(next) => void updateCanvas({ minimapVisible: next })}
          />
        </SettingRow>

        <SettingRow title="滚轮行为" hint="触控板或鼠标滚轮在画布上的动作">
          <Select
            value={preferences.canvas.scrollMode}
            options={scrollModeOptions}
            onChange={(next) => void updateCanvas({ scrollMode: next })}
          />
        </SettingRow>

        <SettingRow title="双击画布缩放" hint="双击空白区域放大画布">
          <Switch
            checked={preferences.canvas.zoomOnDoubleClick}
            onChange={(next) => void updateCanvas({ zoomOnDoubleClick: next })}
          />
        </SettingRow>

        <SettingRow title="网格样式" hint="画布背景的点阵、线格或隐藏">
          <Select
            value={preferences.canvas.gridStyle}
            options={gridStyleOptions}
            onChange={(next) => void updateCanvas({ gridStyle: next })}
          />
        </SettingRow>

        <SettingRow title="减少动效" hint="关闭菜单、面板和提示的过渡动画">
          <Switch
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
          <Switch
            checked={preferences.generation.autoLink}
            onChange={(next) => void updateGeneration({ autoLink: next })}
          />
        </SettingRow>

        <SettingRow title="失败自动重试" hint="只对标记为可重试的生成错误生效">
          <Select
            value={String(preferences.generation.autoRetry)}
            options={retryOptions}
            onChange={(next) =>
              void updateGeneration({ autoRetry: Number(next) })
            }
          />
        </SettingRow>

        <SettingRow title="默认 AI 水印" hint="新建生成任务时默认开启水印">
          <Switch
            checked={preferences.generation.watermark}
            onChange={(next) => void updateGeneration({ watermark: next })}
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

      <div className="settings-group-title">通知与更新</div>
      <div className="settings-group">
        <SettingRow
          title="生成完成通知"
          hint="窗口不在前台时，生成完成会发送系统通知"
        >
          <Switch
            checked={preferences.generation.notifyOnComplete}
            onChange={(next) =>
              void updateGeneration({ notifyOnComplete: next })
            }
          />
        </SettingRow>

        <SettingRow title="启动时检查更新" hint="启动 8 秒后静默检查一次">
          <Switch
            checked={preferences.updates.checkOnStartup}
            onChange={(next) => void updateUpdates({ checkOnStartup: next })}
          />
        </SettingRow>

        <SettingRow
          title="更新通道"
          hint="测试版需要更新源提供对应通道；否则效果与稳定版相同"
        >
          <Select
            value={preferences.updates.channel}
            options={updateChannelOptions}
            onChange={(next) => void updateUpdates({ channel: next })}
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">存储与数据</div>
      <div className="settings-group">
        <SettingRow
          title="缩略图缓存"
          hint={
            thumbInfo
              ? `${formatBytes(thumbInfo.bytes)} · ${thumbInfo.files} 个文件`
              : '正在读取…'
          }
        >
          <Button
            type="button"
            className="btn-secondary btn-sm"
            disabled={cacheBusy || !thumbInfo || thumbInfo.files === 0}
            onClick={() => void clearThumbCache()}
            unstyled
          >
            {cacheBusy ? '清理中…' : '清理缓存'}
          </Button>
        </SettingRow>

        <SettingRow
          title="自动清理缓存"
          hint="按修改时间清理旧的缩略图，访问时会重新生成"
        >
          <Select
            value={String(preferences.storage.autoCleanCacheDays)}
            options={cacheOptions}
            onChange={(next) =>
              void updateStorage({ autoCleanCacheDays: Number(next) })
            }
          />
        </SettingRow>

        <SettingRow title="生成历史" hint={`当前 ${historyCount} 条记录`}>
          <Button
            type="button"
            className="btn-secondary btn-sm"
            disabled={historyCount === 0}
            onClick={() => {
              useGenerationHistoryStore.getState().clear()
              showToast('已清空生成历史')
            }}
            unstyled
          >
            清空历史
          </Button>
        </SettingRow>

        <SettingRow
          title="数据目录"
          hint="包含 models.json、settings.json、preferences.json 和日志"
        >
          <Button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void window.api.settings.openDataDir()}
            unstyled
          >
            打开目录
          </Button>
        </SettingRow>
      </div>

      <div className="settings-group-title">界面</div>
      <div className="settings-group">
        <SettingRow title="界面缩放" hint="主题仍在「外观」分区调整">
          <Select
            value={String(preferences.ui.scale)}
            options={scaleOptions}
            onChange={(next) => void updateUi({ scale: Number(next) })}
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">网络与请求</div>
      <div className="settings-group">
        <SettingRow
          title="模型请求代理"
          hint="模型接口和素材下载使用的网络代理"
        >
          <Select
            value={preferences.network.proxyMode}
            options={proxyModeOptions}
            onChange={(next) => void updateNetwork({ proxyMode: next })}
          />
        </SettingRow>

        {preferences.network.proxyMode === 'manual' ? (
          <SettingRow
            title="代理地址"
            hint="例如 http://127.0.0.1:7890，支持 HTTP/SOCKS"
          >
            <Input
              className="w-64"
              value={proxyDraft}
              placeholder="http://127.0.0.1:7890"
              onChange={(event) => setProxyDraft(event.target.value)}
              onBlur={() => void updateNetwork({ proxyUrl: proxyDraft.trim() })}
            />
          </SettingRow>
        ) : null}

        <SettingRow title="请求超时" hint="单次模型请求的最长等待时间">
          <Select
            value={String(preferences.network.requestTimeout)}
            options={timeoutOptions}
            onChange={(next) =>
              void updateNetwork({ requestTimeout: Number(next) })
            }
          />
        </SettingRow>
      </div>

      <div className="settings-group-title">高级</div>
      <div className="settings-group">
        <SettingRow
          title="备份通用设置"
          hint="导出或导入 preferences.json，不含模型密钥"
        >
          <div className="settings-actions settings-actions--inline">
            <Button
              type="button"
              className="btn-secondary btn-sm"
              disabled={ioBusy}
              onClick={() => void exportPreferences()}
              unstyled
            >
              导出
            </Button>
            <Button
              type="button"
              className="btn-secondary btn-sm"
              disabled={ioBusy}
              onClick={() => void importPreferences()}
              unstyled
            >
              导入
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          title="重置通用设置"
          hint="恢复默认值；模型配置和资产库路径不受影响"
        >
          <Button
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
            unstyled
          >
            重置
          </Button>
        </SettingRow>
      </div>
    </div>
  )
}
