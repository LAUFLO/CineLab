import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Icon } from '../components/Icon'
import { useUIStore } from '../stores/ui'
import { studioOpen } from '../studio/scope'
import { Button } from '../components/ui'

export function BottomBar() {
  const tool = useUIStore((state) => state.tool)
  const setTool = useUIStore((state) => state.setTool)
  const requestAddMenu = useUIStore((state) => state.requestAddMenu)
  const openHistory = useUIStore((state) => state.openHistory)
  const openShortcuts = useUIStore((state) => state.openShortcuts)
  const showToast = useUIStore((state) => state.showToast)

  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const toolWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!toolMenuOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      if (
        toolWrapRef.current &&
        event.target instanceof Node &&
        !toolWrapRef.current.contains(event.target)
      ) {
        setToolMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (studioOpen()) return
      if (event.key === 'Escape') setToolMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [toolMenuOpen])

  const add = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    requestAddMenu({
      x: rect.left + rect.width / 2,
      y: rect.top
    })
  }

  return (
    <div data-slot="bottombar" className="absolute bottom-4 left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-float">
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-7 w-7 rounded-lg !bg-pick-bar !text-fg-inverse hover:!bg-[color-mix(in_srgb,var(--pick-bar)_86%,var(--text-1))] hover:!text-fg-inverse"
        title="添加节点或资源"
        onClick={add}
      >
        <Icon name="plus" />
      </Button>

      <div className="mx-1 h-4 w-px bg-divider" />

      <div className="relative flex" ref={toolWrapRef}>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-7 w-7 rounded-lg ${toolMenuOpen ? '!bg-surface-hover !text-fg' : ''}`}
          title={`当前工具：${tool === 'select' ? '选择' : '抓手'}`}
          onClick={() => setToolMenuOpen((open) => !open)}
        >
          <Icon name={tool === 'select' ? 'cursor' : 'move'} />
        </Button>

        {toolMenuOpen ? (
          <div className="absolute bottom-[38px] left-1/2 z-30 -ml-[74px] w-[148px] rounded-[10px] border border-border bg-surface p-1.5 shadow-menu animate-[menu-in_120ms_ease-out]">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={`!flex h-8 w-full items-center gap-2 !rounded-[7px] px-2 text-[13px] !font-normal hover:bg-surface-hover hover:text-fg ${
                tool === 'select' ? '!bg-surface-hover !text-fg' : ''
              }`}
              onClick={() => {
                setTool('select')
                setToolMenuOpen(false)
              }}
            >
              <Icon name="cursor" size={14} />
              <span>选择</span>
              <kbd className="ml-auto font-[inherit] text-[11px] text-fg-subtle">V</kbd>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={`!flex h-8 w-full items-center gap-2 !rounded-[7px] px-2 text-[13px] !font-normal hover:bg-surface-hover hover:text-fg ${
                tool === 'hand' ? '!bg-surface-hover !text-fg' : ''
              }`}
              onClick={() => {
                setTool('hand')
                setToolMenuOpen(false)
              }}
            >
              <Icon name="move" size={14} />
              <span>抓手</span>
              <kbd className="ml-auto font-[inherit] text-[11px] text-fg-subtle">H</kbd>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mx-1 h-4 w-px bg-divider" />

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-7 w-7 rounded-lg"
        title="生成历史"
        onClick={openHistory}
      >
        <Icon name="history" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-7 w-7 rounded-lg"
        title="快捷键"
        onClick={openShortcuts}
      >
        <Icon name="keyboard" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-7 w-7 rounded-lg"
        title="教程（即将支持）"
        onClick={() => showToast('教程将在后续版本提供')}
      >
        <Icon name="help" />
      </Button>
    </div>
  )
}
