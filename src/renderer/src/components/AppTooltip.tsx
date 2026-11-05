import { useEffect, useRef, useState } from 'react'

interface TipState {
  text: string
  x: number
  y: number
  placement: 'top' | 'bottom'
}

function adoptTitle(element: Element): void {
  const text = element.getAttribute('title')
  if (!text) return
  element.setAttribute('data-tip', text)
  element.removeAttribute('title')
}

/**
 * 统一的应用内悬浮提示：
 * 把原生 title 转成 data-tip，避免浏览器默认黑框提示。
 */
export function AppTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const clearTimer = useRef<number | null>(null)

  useEffect(() => {
    const adoptTree = (root: ParentNode): void => {
      if (root instanceof Element) adoptTitle(root)
      root.querySelectorAll('[title]').forEach(adoptTitle)
    }

    adoptTree(document)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          adoptTitle(mutation.target as Element)
          continue
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) adoptTree(node)
        })
      }
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title']
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const show = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return

      const element = target.closest('[data-tip]')
      if (!element) return

      const text = element.getAttribute('data-tip')
      if (!text) return

      if (clearTimer.current) {
        window.clearTimeout(clearTimer.current)
        clearTimer.current = null
      }

      const rect = element.getBoundingClientRect()
      const showBelow = rect.top < 48
      setTip({
        text,
        x: rect.left + rect.width / 2,
        y: showBelow ? rect.bottom + 6 : rect.top - 6,
        placement: showBelow ? 'bottom' : 'top'
      })
    }

    const hide = (): void => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => {
        setTip(null)
        clearTimer.current = null
      }, 60)
    }

    document.addEventListener('mouseover', show)
    document.addEventListener('mouseout', hide)
    window.addEventListener('scroll', hide, true)

    return () => {
      document.removeEventListener('mouseover', show)
      document.removeEventListener('mouseout', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  if (!tip) return null

  return (
    <div
      className={`app-tooltip ${
        tip.placement === 'bottom' ? 'is-bottom' : ''
      }`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  )
}
