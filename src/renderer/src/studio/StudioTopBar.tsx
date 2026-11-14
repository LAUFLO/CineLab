import { Icon } from '../components/Icon'
import { IconButton, Select } from '../components/ui'
import { docDurationMs, formatTimecode } from '@shared/timeline-layout'
import { useStudioStore } from '../stores/studio'
import { useTimelineStore } from '../stores/timeline'

const RATIOS = [
  { width: 1080, height: 1920, label: '9:16' },
  { width: 1920, height: 1080, label: '16:9' },
  { width: 2560, height: 1080, label: '21:9' },
  { width: 1080, height: 1440, label: '3:4' },
  { width: 1440, height: 1080, label: '4:3' },
  { width: 1080, height: 1080, label: '1:1' }
]

export function StudioTopBar() {
  const close = useStudioStore((state) => state.closeStudio)
  const toggleLeft = useStudioStore((state) => state.toggleLeft)
  const toggleRight = useStudioStore((state) => state.toggleRight)
  const doc = useTimelineStore((state) => state.doc)
  const dispatch = useTimelineStore((state) => state.dispatch)
  const totalMs = doc ? docDurationMs(doc) : 0
  const ratioKey = doc ? `${doc.video.width}x${doc.video.height}` : ''
  const ratio = RATIOS.find(
    (item) => `${item.width}x${item.height}` === ratioKey
  )

  return (
    <header className="studio-top">
      <div className="studio-top__left">
        <IconButton
          label="返回画布"
          className="studio-icon-btn"
          onClick={close}
          unstyled
        >
          <Icon name="chevron-left" size={14} />
        </IconButton>
        <span className="studio-top__title">
          剪辑室 · {doc?.name ?? '未命名项目'}
        </span>
      </div>

      <div className="studio-top__meta">
        <span className="studio-saved-dot" />
        <span>已保存</span>
        <span className="studio-top__sep" />
        <span>{formatTimecode(totalMs)}</span>
        <span className="studio-top__sep" />
        {doc ? (
          <Select
            className="studio-top__ratio"
            value={ratio ? `${ratio.width}x${ratio.height}` : ''}
            options={[
              ...(ratio
                ? []
                : [
                    {
                      value: '',
                      label: `${doc.video.width}×${doc.video.height}`
                    }
                  ]),
              ...RATIOS.map((item) => ({
                value: `${item.width}x${item.height}`,
                label: item.label
              }))
            ]}
            onChange={(value) => {
              const [width, height] = value.split('x').map(Number)
              if (!width || !height) return
              dispatch({
                op: 'setTimelineVideo',
                video: { ...doc.video, width, height }
              })
            }}
          />
        ) : null}
        <span>{doc ? `${doc.video.fps}fps` : '—'}</span>
      </div>

      <div className="studio-top__right">
        <IconButton
          label="切换素材池"
          className="studio-icon-btn"
          onClick={toggleLeft}
          unstyled
        >
          <Icon name="library" size={14} />
        </IconButton>
        <IconButton
          label="切换检查器"
          className="studio-icon-btn"
          onClick={toggleRight}
          unstyled
        >
          <Icon name="layers" size={14} />
        </IconButton>
        <span className="studio-top__hint">成片在画布节点生成</span>
        <IconButton
          label="关闭"
          className="studio-icon-btn"
          onClick={close}
          unstyled
        >
          <Icon name="close" size={14} />
        </IconButton>
      </div>
    </header>
  )
}
