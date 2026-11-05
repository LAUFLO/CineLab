import { useCallback, useEffect, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type FinalConnectionState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import { Icon } from '../components/Icon'
import { useCanvasStore, type CineNode } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { AddNodeMenu } from './AddNodeMenu'
import { CanvasContextMenu } from './CanvasContextMenu'
import { copySelection, pasteAt } from './context-actions'
import { FlowEdge } from './edges/FlowEdge'
import { CineNodeView } from './nodes/CineNodeView'
import { PromptBar } from './PromptBar'

type Theme = 'light' | 'dark'

const nodeTypes = { cine: CineNodeView }
const edgeTypes = { flow: FlowEdge }

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
  const arrangeNodes = useCanvasStore((state) => state.arrangeNodes)
  const closeMenu = useUIStore((state) => state.closeMenu)
  const openMenu = useUIStore((state) => state.openMenu)
  const openContextMenu = useUIStore((state) => state.openContextMenu)
  const snapToGrid = useUIStore((state) => state.snapToGrid)
  const edgesVisible = useUIStore((state) => state.edgesVisible)
  const minimapVisible = useUIStore((state) => state.minimapVisible)
  const fitViewToken = useUIStore((state) => state.fitViewToken)
  const arrangeToken = useUIStore((state) => state.arrangeToken)
  const { screenToFlowPosition, fitView } = useReactFlow()

  const connectStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (fitViewToken === 0) return
    void fitView({ padding: 0.2, duration: 300 })
  }, [fitViewToken, fitView])

  useEffect(() => {
    if (arrangeToken === 0) return
    arrangeNodes()
    window.setTimeout(() => void fitView({ padding: 0.2, duration: 300 }), 50)
  }, [arrangeToken, arrangeNodes, fitView])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        useUIStore.getState().requestArrange()
        return
      }

      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }

      if (!event.ctrlKey && !event.metaKey) return

      const key = event.key.toLowerCase()

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) useCanvasStore.getState().redo()
        else useCanvasStore.getState().undo()
        return
      }

      if (key === 'c' && !event.shiftKey) {
        if (!useCanvasStore.getState().nodes.some((node) => node.selected)) return
        event.preventDefault()
        copySelection()
        return
      }

      if (key === 'v' && !event.shiftKey) {
        event.preventDefault()
        void pasteAt()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      if (target.closest('.react-flow__node')) return

      openMenu({
        screen: { x: event.clientX, y: event.clientY },
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY })
      })
    },
    [screenToFlowPosition, openMenu]
  )

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault()
      closeMenu()
      openContextMenu({
        screen: { x: event.clientX, y: event.clientY },
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY })
      })
    },
    [closeMenu, openContextMenu, screenToFlowPosition]
  )

  const handleNodeDragStart = useCallback(() => {
    useCanvasStore.getState().pushHistory()
  }, [])

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, targetNode: CineNode) => {
      void fitView({
        nodes: [targetNode],
        padding: 0.6,
        duration: 300,
        maxZoom: 2
      })
    },
    [fitView]
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

  const dotColor = theme === 'light' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.24)'

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edgesVisible ? edges : []}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onPaneClick={closeMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={(event) => event.preventDefault()}
        onNodeDragStart={handleNodeDragStart}
        onDoubleClick={handleDoubleClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={viewport}
        onMove={(_event, next) => setViewport(next)}
        panOnScroll
        panOnDrag={[1]}
        snapToGrid={snapToGrid}
        snapGrid={[16, 16] as [number, number]}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={60}
        selectionOnDrag
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color={dotColor} />
        {minimapVisible ? (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            nodeColor={() =>
              theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
            }
            maskColor={theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.08)'}
            style={{
              left: 16,
              bottom: 72,
              width: 200,
              height: 120,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10
            }}
          />
        ) : null}
      </ReactFlow>

      {nodes.length === 0 ? <EmptyState onCreate={createAtCenter} /> : null}

      <PromptBar />
      <AddNodeMenu />
      <CanvasContextMenu />
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
