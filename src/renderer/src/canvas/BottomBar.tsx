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
    <div className="bottombar">
      <Button
        type="button"
        className="icon-btn bottombar__add"
        title="添加节点或资源"
        onClick={add}
        unstyled
      >
        <Icon name="plus" />
      </Button>

      <div className="bottombar__divider" />

      <div className="bottombar__tool" ref={toolWrapRef}>
        <Button
          type="button"
          className={`icon-btn ${toolMenuOpen ? 'is-open' : ''}`}
          title={`当前工具：${tool === 'select' ? '选择' : '抓手'}`}
          onClick={() => setToolMenuOpen((open) => !open)}
          unstyled
        >
          <Icon name={tool === 'select' ? 'cursor' : 'move'} />
        </Button>

        {toolMenuOpen ? (
          <div className="bottombar__tool-menu">
            <Button
              type="button"
              className={`bottombar__tool-item ${
                tool === 'select' ? 'is-active' : ''
              }`}
              onClick={() => {
                setTool('select')
                setToolMenuOpen(false)
              }}
              unstyled
            >
              <Icon name="cursor" size={14} />
              <span>选择</span>
              <kbd>V</kbd>
            </Button>
            <Button
              type="button"
              className={`bottombar__tool-item ${
                tool === 'hand' ? 'is-active' : ''
              }`}
              onClick={() => {
                setTool('hand')
                setToolMenuOpen(false)
              }}
              unstyled
            >
              <Icon name="move" size={14} />
              <span>抓手</span>
              <kbd>H</kbd>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="bottombar__divider" />

      <Button
        type="button"
        className="icon-btn"
        title="生成历史"
        onClick={openHistory}
        unstyled
      >
        <Icon name="history" />
      </Button>
      <Button
        type="button"
        className="icon-btn"
        title="快捷键"
        onClick={openShortcuts}
        unstyled
      >
        <Icon name="keyboard" />
      </Button>
      <Button
        type="button"
        className="icon-btn"
        title="教程（即将支持）"
        onClick={() => showToast('教程将在后续版本提供')}
        unstyled
      >
        <Icon name="help" />
      </Button>
    </div>
  )
}
