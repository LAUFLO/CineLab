import { useCallback, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type FinalConnectionState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { AddNodeMenu } from './AddNodeMenu'
import { FlowEdge } from './edges/FlowEdge'
import { CineNodeView } from './nodes/CineNodeView'
import { PromptBar } from './PromptBar'

type Theme = 'light' | 'dark'

const nodeTypes = { cine: CineNodeView }
const edgeTypes = { flow: FlowEdge }

function Watermark({ theme }: { theme: Theme }) {
  const { x, y, zoom } = useViewport()
  const color = theme === 'light' ? 'rgba(0,0,0,0.028)' : 'rgba(255,255,255,0.035)'

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320">` +
    `<text x="20" y="180" font-family="Inter, 'PingFang SC', sans-serif" font-size="48" font-weight="800" fill="${color}" transform="rotate(-18 20 180)">CineLab 2026-11-04</text>` +
    `</svg>`

  return (
    <div
      className="watermark"
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        backgroundSize: `${560 * zoom}px ${320 * zoom}px`,
        backgroundPosition: `${x}px ${y}px`
      }}
    />
  )
}

function EmptyState({ onCreate }: { onCreate: (kind: NodeKind) => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state__hint">
        <Icon name="cursor" size={14} />
        双击画布 自由生成节点
      </div>
      <div className="empty-state__actions">
        <button type="button" className="empty-action" onClick={() => onCreate('image')}>
          <Icon name="image" size={18} />
          图片生成
        </button>
        <button type="button" className="empty-action" onClick={() => onCreate('video')}>
          <Icon name="video" size={18} />
          视频生成
        </button>
        <button type="button" className="empty-action" onClick={() => onCreate('audio')}>
          <Icon name="audio" size={18} />
          音频生成
        </button>
        <button type="button" className="empty-action" onClick={() => onCreate('text')}>
          <Icon name="text" size={18} />
          剧本生成
        </button>
      </div>
    </div>
  )
}

function CanvasInner({ theme }: { theme: Theme }) {
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const onNodesChange = useCanvasStore((state) => state.onNodesChange)
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const addNode = useCanvasStore((state) => state.addNode)
  const viewport = useCanvasStore((state) => state.viewport)
  const setViewport = useCanvasStore((state) => state.setViewport)
  const closeMenu = useUIStore((state) => state.closeMenu)
  const openMenu = useUIStore((state) => state.openMenu)
  const { screenToFlowPosition } = useReactFlow()

  const connectStart = useRef<{ x: number; y: number } | null>(null)

  const handleConnectStart = useCallback((event: MouseEvent | TouchEvent) => {
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    connectStart.current = { x: point.clientX, y: point.clientY }
  }, [])

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      const start = connectStart.current
      connectStart.current = null

      if (!start) return
      const moved = Math.hypot(point.clientX - start.x, point.clientY - start.y) > 6
      if (!moved || state.toNode || !state.fromNode) return
      if (state.fromHandle?.type !== 'source') return

      openMenu({
        screen: { x: point.clientX, y: point.clientY },
        flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        source: {
          nodeId: state.fromNode.id,
          handle: 'source'
        }
      })
    },
    [screenToFlowPosition, openMenu]
  )

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.react-flow__pane')) return

      openMenu({
        screen: { x: event.clientX, y: event.clientY },
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY })
      })
    },
    [screenToFlowPosition, openMenu]
  )

  const createAtCenter = useCallback(
    (kind: NodeKind) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      })
      const meta = NODE_META[kind]

      addNode(kind, {
        x: center.x - meta.width / 2,
        y: center.y - (meta.height + TITLE_HEIGHT) / 2
      })
    },
    [screenToFlowPosition, addNode]
  )

  const dotColor = theme === 'light' ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.055)'

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onPaneClick={closeMenu}
        onDoubleClick={handleDoubleClick}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={viewport}
        onMove={(_event, next) => setViewport(next)}
        panOnScroll
        connectionMode={ConnectionMode.Loose}
        connectionRadius={60}
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={dotColor} />
        <Watermark theme={theme} />
      </ReactFlow>

      {nodes.length === 0 ? <EmptyState onCreate={createAtCenter} /> : null}

      <PromptBar />
      <AddNodeMenu />
    </>
  )
}

export function Canvas({ theme }: { theme: Theme }) {
  return (
    <div className="canvas-root">
      <ReactFlowProvider>
        <CanvasInner theme={theme} />
      </ReactFlowProvider>
    </div>
  )
}
