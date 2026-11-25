import { createPortal } from 'react-dom'
import { useFilmStudyStore } from '../../stores/film-study'
import { useUIStore } from '../../stores/ui'
import { Icon } from '../../components/Icon'
import {
  buildStudyTableMarkdown,
  buildStudyTableRows,
  STUDY_TABLE_HEADERS,
  studyClock
} from './study-sheet'
import { Button, IconButton } from '../../components/ui'

const TH_CLASS =
  'sticky top-0 z-[1] whitespace-nowrap border-b border-border bg-surface p-2 text-left font-medium text-fg-subtle'
const TD_CLASS = 'border-b border-divider p-2 align-top leading-[1.55]'
const TEXT_CLASS = `max-w-[340px] min-w-[180px] ${TD_CLASS}`

export function FilmStudySheet() {
  const nodeId = useFilmStudyStore((state) => state.sheetNodeId)
  const study = useFilmStudyStore((state) => state.sheetStudy)
  const loading = useFilmStudyStore((state) => state.sheetLoading)
  const close = useFilmStudyStore((state) => state.closeSheet)
  const showToast = useUIStore((state) => state.showToast)

  if (!nodeId) return null

  const rows = study ? buildStudyTableRows(study) : []

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制')
    } catch {
      showToast('复制失败', 'error')
    }
  }

  const body = loading ? (
    <div className="p-10 text-center text-xs text-fg-subtle">
      正在读取分镜表…
    </div>
  ) : !study ? (
    <div className="p-10 text-center text-xs text-fg-subtle">
      没有可用的拉片结果
    </div>
  ) : (
    <>
      {!study.autoAnalyzedAt ? (
        <div className="mb-2.5 rounded-card border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-2.5 py-2 text-[11px] leading-[1.55] text-warning">
          当前只有基础分镜，景别 / 运镜 / 提示词尚未生成。可在拉片节点选择 AI
          描述后重新拉片。
        </div>
      ) : null}

      <div className="min-w-[1280px]">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              {STUDY_TABLE_HEADERS.map((header) => (
                <th key={header} className={TH_CLASS}>
                  {header}
                </th>
              ))}
              <th className={TH_CLASS} />
            </tr>
          </thead>
          <tbody className="text-fg-muted">
            {rows.map((row) => (
              <tr key={row.index} className="hover:[&>td]:bg-surface-hover">
                <td
                  className={`${TD_CLASS} whitespace-nowrap tabular-nums text-fg`}
                >
                  {String(row.index).padStart(2, '0')}
                </td>
                <td
                  className={`${TD_CLASS} whitespace-nowrap tabular-nums text-fg-subtle`}
                >
                  {row.time}
                </td>
                <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}>
                  {row.duration}
                </td>
                <td className={TD_CLASS}>{row.shotSize || '—'}</td>
                <td className={TD_CLASS}>{row.cameraAngle || '—'}</td>
                <td className={TD_CLASS}>{row.cameraMove || '—'}</td>
                <td className={TD_CLASS}>{row.lighting || '—'}</td>
                <td className={TEXT_CLASS}>{row.visual || '—'}</td>
                <td className={TEXT_CLASS}>{row.dialogue || '—'}</td>
                <td className={TD_CLASS}>{row.production || '—'}</td>
                <td className={TEXT_CLASS}>{row.prompt || '—'}</td>
                <td className={TEXT_CLASS}>{row.sound || '—'}</td>
                <td className={TD_CLASS}>
                  <IconButton
                    label="复制这一镜的提示词"
                    size="sm"
                    onClick={() =>
                      void copy(
                        [
                          `镜 ${String(row.index).padStart(2, '0')} · ${row.time}`,
                          [
                            row.shotSize,
                            row.cameraAngle,
                            row.cameraMove
                          ]
                            .filter(Boolean)
                            .join(' · '),
                          row.prompt || row.visual
                        ]
                          .filter(Boolean)
                          .join('\n')
                      )
                    }
                  >
                    <Icon name="copy" size={12} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[950] flex items-center justify-center bg-overlay px-6 pt-12 pb-6"
      onPointerDown={close}
    >
      <div
        className="flex h-[min(900px,calc(100vh_-_72px))] w-[min(1440px,calc(100vw_-_48px))] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-float"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-divider pr-3.5 pl-[18px]">
          <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-fg">
            <Icon name="film" size={15} />
            <span>分镜表</span>
            <span className="max-w-[320px] truncate text-xs text-fg-subtle">
              {study?.sourceName ?? ''}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2.5 whitespace-nowrap text-[11px] text-fg-subtle">
            {study ? (
              <>
                <span>{rows.length} 个镜头</span>
                <span>{study.frames.length} 张代表帧</span>
                <span>{studyClock(study.duration)}</span>
              </>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!study}
              onClick={() =>
                void copy(study ? buildStudyTableMarkdown(study) : '')
              }
            >
              复制整表
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!study}
              onClick={() =>
                study
                  ? void window.api.filmStudy
                      .exportMarkdown(study.id)
                      .catch((error) =>
                        showToast(
                          error instanceof Error
                            ? error.message
                            : String(error),
                          'error'
                        )
                      )
                  : undefined
              }
            >
              导出 Markdown
            </Button>
            <IconButton label="关闭" size="sm" onClick={close}>
              <Icon name="close" size={14} />
            </IconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-4">
          {body}
        </div>
      </div>
    </div>,
    document.body
  )
}
