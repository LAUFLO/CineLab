import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Icon } from '../components/Icon'
import { useUIStore } from '../stores/ui'

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
        !toolWrapRef.current.contains(event.target as Node)
      ) {
        setToolMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
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
      <button
        type="button"
        className="icon-btn bottombar__add"
        title="添加节点或资源"
        onClick={add}
      >
        <Icon name="plus" />
      </button>

      <div className="bottombar__divider" />

      <div className="bottombar__tool" ref={toolWrapRef}>
        <button
          type="button"
          className={`icon-btn ${toolMenuOpen ? 'is-open' : ''}`}
          title={`当前工具：${tool === 'select' ? '选择' : '抓手'}`}
          onClick={() => setToolMenuOpen((open) => !open)}
        >
          <Icon name={tool === 'select' ? 'cursor' : 'move'} />
        </button>

        {toolMenuOpen ? (
          <div className="bottombar__tool-menu">
            <button
              type="button"
              className={`bottombar__tool-item ${
                tool === 'select' ? 'is-active' : ''
              }`}
              onClick={() => {
                setTool('select')
                setToolMenuOpen(false)
              }}
            >
              <Icon name="cursor" size={14} />
              <span>选择</span>
              <kbd>V</kbd>
            </button>
            <button
              type="button"
              className={`bottombar__tool-item ${
                tool === 'hand' ? 'is-active' : ''
              }`}
              onClick={() => {
                setTool('hand')
                setToolMenuOpen(false)
              }}
            >
              <Icon name="move" size={14} />
              <span>抓手</span>
              <kbd>H</kbd>
            </button>
          </div>
        ) : null}
      </div>

      <div className="bottombar__divider" />

      <button type="button" className="icon-btn" title="生成历史" onClick={openHistory}>
        <Icon name="history" />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="快捷键"
        onClick={openShortcuts}
      >
        <Icon name="keyboard" />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="教程（即将支持）"
        onClick={() => showToast('教程将在后续版本提供')}
      >
        <Icon name="help" />
      </button>

      <button
        type="button"
        className="bottombar__agent"
        title="AI 助手（即将支持）"
        onClick={() => showToast('AI 助手将在后续版本提供')}
      >
        <Icon name="robot" size={19} />
      </button>
    </div>
  )
}
