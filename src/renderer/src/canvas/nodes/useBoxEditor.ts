import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_SIZE = 36

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function constrain(
  base: Box,
  mode: DragMode,
  dx: number,
  dy: number,
  maxWidth: number,
  maxHeight: number
): Box {
  if (mode === 'move') {
    return {
      ...base,
      x: clamp(base.x + dx, 0, Math.max(0, maxWidth - base.width)),
      y: clamp(base.y + dy, 0, Math.max(0, maxHeight - base.height))
    }
  }

  let { x, y, width, height } = base

  if (mode.includes('w')) {
    const nextX = clamp(base.x + dx, 0, base.x + base.width - MIN_SIZE)
    width = base.width + (base.x - nextX)
    x = nextX
  }

  if (mode.includes('e')) {
    width = clamp(base.width + dx, MIN_SIZE, maxWidth - base.x)
  }

  if (mode.includes('n')) {
    const nextY = clamp(base.y + dy, 0, base.y + base.height - MIN_SIZE)
    height = base.height + (base.y - nextY)
    y = nextY
  }

  if (mode.includes('s')) {
    height = clamp(base.height + dy, MIN_SIZE, maxHeight - base.y)
  }

  return { x, y, width, height }
}

export function useBoxEditor(
  maxWidth: number,
  maxHeight: number,
  initial: Box,
  resetKey: unknown
): {
  box: Box
  startDrag: (mode: DragMode) => (event: ReactPointerEvent) => void
} {
  const [box, setBox] = useState<Box>(initial)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    box: Box
  } | null>(null)

  useEffect(() => {
    setBox(initial)
    // 仅在尺寸或打开状态变化时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxWidth, maxHeight, resetKey])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return

      setBox(
        constrain(
          drag.box,
          drag.mode,
          event.clientX - drag.startX,
          event.clientY - drag.startY,
          maxWidth,
          maxHeight
        )
      )
    }

    const onUp = (): void => {
      dragRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [maxWidth, maxHeight])

  const startDrag =
    (mode: DragMode) =>
    (event: ReactPointerEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        box
      }
    }

  return { box, startDrag }
}
