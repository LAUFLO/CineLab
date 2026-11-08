import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
import {
  isGroupNode,
  useCanvasStore,
  type CanvasNode
} from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { usePreferencesStore } from '../stores/preferences'
import { studioOpen } from '../studio/scope'
import { AddNodeMenu } from './AddNodeMenu'
import { AlignmentGuides, type AlignmentGuide } from './AlignmentGuides'
import { computeAlignment } from './alignment'
import { CanvasContextMenu } from './CanvasContextMenu'
import { NodeContextMenu } from './NodeContextMenu'
import { copySelection, pasteAt } from './context-actions'
import { requestDeleteSelection } from './delete-actions'
import { FlowEdge } from './edges/FlowEdge'
import { GroupToolbar } from './GroupToolbar'
import { MultiSelectBar } from './MultiSelectBar'
import { StoryboardToolbar } from './StoryboardToolbar'
import { CineNodeView } from './nodes/CineNodeView'
import { FilmNodeView } from './nodes/FilmNodeView'
import { GroupNodeView } from './nodes/GroupNodeView'
import { StudioNodeView } from './nodes/StudioNodeView'
import { StageNodeView } from './nodes/StageNodeView'
import { VideoOpNodeView } from './nodes/VideoOpNodeView'
import { PromptBar } from './PromptBar'
import { UpstreamWatcher } from './UpstreamWatcher'
import { HistoryPanel } from '../panels/HistoryPanel'
import { NodeSearch } from '../panels/NodeSearch'
import { ShortcutPanel } from '../panels/ShortcutPanel'

type Theme = 'light' | 'dark'

const nodeTypes = {
  cine: CineNodeView,
  group: GroupNodeView,
  studio: StudioNodeView,
  stage: StageNodeView,
  film: FilmNodeView,
  'video-op': VideoOpNodeView
}
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
  const setBoxSelecting = useCanvasStore((state) => state.setBoxSelecting)
  const tool = useUIStore((state) => state.tool)
  const setTool = useUIStore((state) => state.setTool)
  const addMenuToken = useUIStore((state) => state.addMenuToken)
  const addMenuAnchor = useUIStore((state) => state.addMenuAnchor)
  const openSearch = useUIStore((state) => state.openSearch)
  const closeMenu = useUIStore((state) => state.closeMenu)
  const openMenu = useUIStore((state) => state.openMenu)
  const openContextMenu = useUIStore((state) => state.openContextMenu)
  const closeContextMenu = useUIStore((state) => state.closeContextMenu)
  const openNodeContextMenu = useUIStore((state) => state.openNodeContextMenu)
  const snapToGrid = useUIStore((state) => state.snapToGrid)
  const edgesVisible = useUIStore((state) => state.edgesVisible)
  const minimapVisible = useUIStore((state) => state.minimapVisible)
  const canvasPreferences = usePreferencesStore((state) => state.preferences.canvas)
  const fitViewToken = useUIStore((state) => state.fitViewToken)
  const arrangeToken = useUIStore((state) => state.arrangeToken)
  const { screenToFlowPosition, fitView, getNodes, setNodes, flowToScreenPosition, getZoom } =
    useReactFlow()

  const connectStart = useRef<{ x: number; y: number } | null>(null)
  const addMenuHandled = useRef(0)
  const [guides, setGuides] = useState<AlignmentGuide[]>([])
  const [spaceHeld, setSpaceHeld] = useState(false)

  const handMode = tool === 'hand' || spaceHeld
  const selectedNodes = nodes.filter((node) => node.selected)
  const singleGroupSelected =
    selectedNodes.length === 1 && isGroupNode(selectedNodes[0])

  useEffect(() => {
    if (addMenuToken === 0 || addMenuToken === addMenuHandled.current) return
    addMenuHandled.current = addMenuToken

    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    openMenu({
      screen: addMenuAnchor ?? center,
      flow: screenToFlowPosition(center),
      placement: addMenuAnchor ? 'above' : 'cursor'
    })
  }, [addMenuAnchor, addMenuToken, openMenu, screenToFlowPosition])

  useEffect(() => {
    const editable = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      Boolean(target.closest('input, textarea, [contenteditable="true"]'))

    const onKeyDown = (event: KeyboardEvent): void => {
      if (studioOpen()) return
      if (event.code !== 'Space' || editable(event.target)) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const onBlur = (): void => setSpaceHeld(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

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
      if (studioOpen()) return
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

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        const state = useCanvasStore.getState()
        if (!state.nodes.some((node) => node.selected)) return

        event.preventDefault()
        requestDeleteSelection()
        return
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const plainKey = event.key.toLowerCase()
        if (plainKey === 'v') {
          event.preventDefault()
          setTool('select')
          return
        }
        if (plainKey === 'h') {
          event.preventDefault()
          setTool('hand')
          return
        }
      }

      if (!event.ctrlKey && !event.metaKey) return

      const key = event.key.toLowerCase()

      if (key === 'f') {
        event.preventDefault()
        openSearch()
        return
      }

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
  }, [openSearch, setTool])

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

  const handleNodeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, node: CanvasNode) => {
      event.preventDefault()
      closeMenu()
      closeContextMenu()
      setNodes((nodes) =>
        nodes.map((item) => ({ ...item, selected: item.id === node.id }))
      )
      openNodeContextMenu({
        screen: { x: event.clientX, y: event.clientY },
        nodeId: node.id
      })
    },
    [closeContextMenu, closeMenu, openNodeContextMenu, setNodes]
  )

  const handleNodeDragStart = useCallback(() => {
    useCanvasStore.getState().pushHistory()
    setGuides([])
  }, [])

  const alignmentContext = useCallback(
    (draggedNodes: CanvasNode[]) => {
      const draggedIds = new Set(draggedNodes.map((node) => node.id))
      const others = (getNodes() as CanvasNode[]).filter(
        (node) =>
          !draggedIds.has(node.id) &&
          !node.hidden &&
          !isGroupNode(node)
      )

      return { draggedIds, others }
    },
    [getNodes]
  )

  const handleNodeDrag = useCallback(
    (
      event: MouseEvent | TouchEvent,
      _node: CanvasNode,
      draggedNodes: CanvasNode[]
    ): void => {
      const altKey = 'altKey' in event ? event.altKey : false
      if (
        altKey ||
        draggedNodes.length === 0 ||
        draggedNodes.some(isGroupNode)
      ) {
        setGuides([])
        return
      }

      const { others } = alignmentContext(draggedNodes)
      if (others.length === 0) {
        setGuides([])
        return
      }

      const result = computeAlignment(draggedNodes, others, getZoom())
      const nextGuides: AlignmentGuide[] = []

      if (result.vertical) {
        nextGuides.push({
          orientation: 'vertical',
          position: flowToScreenPosition({ x: result.vertical.value, y: 0 }).x
        })
      }

      if (result.horizontal) {
        nextGuides.push({
          orientation: 'horizontal',
          position: flowToScreenPosition({ x: 0, y: result.horizontal.value }).y
        })
      }

      setGuides(nextGuides)
    },
    [alignmentContext, flowToScreenPosition, getZoom]
  )

  const handleNodeDragStop = useCallback(
    (
      event: MouseEvent | TouchEvent,
      _node: CanvasNode,
      draggedNodes: CanvasNode[]
    ): void => {
      setGuides([])

      const draggedIds = new Set(draggedNodes.map((node) => node.id))
      for (const node of draggedNodes) {
        if (!node.parentId || draggedIds.has(node.parentId)) continue
        useCanvasStore.getState().detachNode(node.id)
      }

      const altKey = 'altKey' in event ? event.altKey : false
      if (
        altKey ||
        draggedNodes.length === 0 ||
        draggedNodes.some(isGroupNode)
      ) {
        return
      }

      const context = alignmentContext(draggedNodes)
      const others = context.others
      if (others.length === 0) return

      const { dx, dy } = computeAlignment(draggedNodes, others, getZoom())
      if (dx === 0 && dy === 0) return

      setNodes(
        getNodes().map((node) => {
          if (!draggedIds.has(node.id)) return node
          const current = draggedNodes.find((item) => item.id === node.id)
          if (!current) return node

          return {
            ...node,
            position: {
              x: current.position.x + dx,
              y: current.position.y + dy
            }
          }
        })
      )
    },
    [alignmentContext, getNodes, setNodes, getZoom]
  )

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, targetNode: CanvasNode) => {
      if (isGroupNode(targetNode)) return
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
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onDoubleClick={handleDoubleClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={viewport}
        onMove={(_event, next) => setViewport(next)}
        className={[
          handMode ? 'is-hand-tool' : '',
          singleGroupSelected ? 'is-single-group' : ''
        ]
          .filter(Boolean)
          .join(' ') || undefined}
        style={
          {
            '--canvas-zoom': viewport.zoom,
            '--canvas-zoom-inverse': 1 / (viewport.zoom || 1),
            '--node-toolbar-offset': `${10 / (viewport.zoom || 1)}px`
          } as CSSProperties
        }
        panOnScroll={canvasPreferences.scrollMode === 'pan'}
        zoomOnScroll={canvasPreferences.scrollMode === 'zoom'}
        panOnDrag={handMode ? true : [1]}
        nodesDraggable={!handMode}
        snapToGrid={snapToGrid}
        snapGrid={[16, 16] as [number, number]}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={60}
        selectionOnDrag={!handMode}
        onSelectionStart={() => setBoxSelecting(true)}
        onSelectionEnd={() => setBoxSelecting(false)}
        zoomOnDoubleClick={canvasPreferences.zoomOnDoubleClick}
        deleteKeyCode={null}
      >
        {canvasPreferences.gridStyle === 'none' ? null : (
          <Background
            variant={
              canvasPreferences.gridStyle === 'lines'
                ? BackgroundVariant.Lines
                : BackgroundVariant.Dots
            }
            gap={20}
            size={1.2}
            color={dotColor}
          />
        )}
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

      <AlignmentGuides guides={guides} />
      <UpstreamWatcher />
      <PromptBar />
      <MultiSelectBar />
      <GroupToolbar />
      <StoryboardToolbar />
      <AddNodeMenu />
      <CanvasContextMenu />
      <NodeContextMenu />
      <ShortcutPanel />
      <HistoryPanel />
      <NodeSearch />
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
