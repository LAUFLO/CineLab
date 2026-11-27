import { useMemo, useState } from 'react'
import { Button } from '../components/ui'
import { useUIStore } from '../stores/ui'
import { useStageStore } from './stageStore'

const PACE = { fast: 0.6, normal: 1, slow: 1.6 } as const
type PaceKey = keyof typeof PACE
type CoverageMode = 'auto' | 'single' | 'dialogue' | 'group'

const GUIDE_BUTTON_CLASS =
  'h-8 w-full !rounded-md text-[11px] !font-normal text-fg hover:!border-border hover:bg-surface-hover hover:!text-fg'
const STEP_CLASS =
  'flex size-5 items-center justify-center rounded-full border border-border text-[10px] text-fg-subtle data-[active]:border-accent data-[active]:bg-accent data-[active]:text-accent-text'

export function StageBeginnerGuide({
  canGenerateFromScene,
  onImportReference,
  onGenerateFromScene,
  onDone
}: {
  canGenerateFromScene: boolean
  onImportReference: () => void
  onGenerateFromScene: () => void
  onDone: () => void
}) {
  const doc = useStageStore((state) => state.doc)
  const addObject = useStageStore((state) => state.addObject)
  const autoCoverage = useStageStore((state) => state.autoCoverage)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pace, setPace] = useState<PaceKey>('normal')

  const people = useMemo(
    () => doc?.objects.filter((object) => object.type === 'human') ?? [],
    [doc?.objects]
  )

  const generate = (mode: CoverageMode): void => {
    const count =
      mode === 'single'
        ? 1
        : mode === 'dialogue'
          ? 2
          : Math.min(8, people.length)
    const subjectIds = people.slice(0, count).map((object) => object.id)
    if (subjectIds.length === 0) {
      useUIStore.getState().showToast('请先添加人物，再生成分镜')
      return
    }
    const applied = autoCoverage({
      subjectIds,
      mode,
      pace: PACE[pace],
      replace: true
    })
    if (applied) {
      useUIStore.getState().showToast('分镜已生成，可在时间线继续调整')
      onDone()
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <section className="pointer-events-auto w-[420px] rounded-card border border-border bg-surface p-3.5 shadow-float">
        <header className="mb-2.5 flex items-start justify-between border-b border-border pb-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-fg-subtle">新手向导</span>
            <strong className="text-[13px]">3 步做出第一段预演</strong>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-6 px-1.5 text-[10px] text-fg-subtle"
            onClick={onDone}
          >
            跳过
          </Button>
        </header>

        <div className="mb-2.5 flex items-center gap-1.5 text-[10px] text-fg-subtle">
          {([1, 2, 3] as const).map((value) => (
            <span
              key={value}
              className={STEP_CLASS}
              data-active={step === value ? '' : undefined}
            >
              {value}
            </span>
          ))}
          <span className="ml-1">
            {step === 1 ? '选起点' : step === 2 ? '放人物' : '一键分镜'}
          </span>
        </div>

        {step === 1 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-fg-muted">
              先给片场一个起点：导入参考图让 AI 搭出白模场景，或从空白场景开始自己摆位。
            </p>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="none"
                className={GUIDE_BUTTON_CLASS}
                onClick={onImportReference}
              >
                ① 导入参考图
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="none"
                className={GUIDE_BUTTON_CLASS}
                disabled={!canGenerateFromScene}
                title={
                  canGenerateFromScene
                    ? '用已连接的参考图生成白模场景'
                    : '需要先导入并连接一张参考图'
                }
                onClick={onGenerateFromScene}
              >
                ② 从参考图生成白模场景
              </Button>
              <Button
                type="button"
                variant="primary"
                size="none"
                className={GUIDE_BUTTON_CLASS}
                onClick={() => setStep(2)}
              >
                ③ 从空白场景开始
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-fg-muted">
              添加至少 1 个人物，向导会自动排出全景、中景、近景；之后都能手动改。
            </p>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={GUIDE_BUTTON_CLASS}
              onClick={() => addObject('human')}
            >
              + 添加人物（当前 {people.length} 人）
            </Button>
            <Button
              type="button"
              variant="primary"
              size="none"
              className={GUIDE_BUTTON_CLASS}
              disabled={people.length === 0}
              onClick={() => setStep(3)}
            >
              下一步：一键分镜
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-fg-muted">
              选一个节奏，或直接套用成片预设。生成后可在时间线继续调整。
            </p>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[10px] text-fg-subtle">节奏</span>
              {(
                [
                  ['fast', '快'],
                  ['normal', '标准'],
                  ['slow', '舒缓']
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="none"
                  className="h-6 px-2 !rounded-md text-[10px] text-fg-muted data-[active]:bg-surface-hover data-[active]:text-fg"
                  data-active={pace === key ? '' : undefined}
                  onClick={() => setPace(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="primary"
              size="none"
              className={GUIDE_BUTTON_CLASS}
              onClick={() => generate('auto')}
            >
              一键生成分镜
            </Button>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="h-7 !rounded-md text-[10px] !font-normal text-fg-muted"
                disabled={people.length < 1}
                onClick={() => generate('single')}
              >
                单人三镜
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="h-7 !rounded-md text-[10px] !font-normal text-fg-muted"
                disabled={people.length < 2}
                onClick={() => generate('dialogue')}
              >
                双人对话
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="h-7 !rounded-md text-[10px] !font-normal text-fg-muted"
                disabled={people.length < 2}
                onClick={() => generate('group')}
              >
                群戏轮切
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
