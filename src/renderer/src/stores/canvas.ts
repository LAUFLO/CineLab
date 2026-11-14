import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
  type XYPosition
} from '@xyflow/react'
import { create } from 'zustand'
import {
  GROUP_GAP,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  GROUP_RATIO_VALUE,
  NODE_META,
  STORYBOARD_CELL_WIDTH,
  STORYBOARD_GAP,
  STORYBOARD_MAX_NODES,
  TITLE_HEIGHT,
  type CineNodeData,
  type FilmNodeData,
  type FilmStatus,
  type GroupColor,
  type GroupMode,
  type GroupNodeData,
  type GroupRatio,
  type NodeKind,
  type OutputRef,
  type StageNodeData,
  type StudioNodeData,
  type VideoOpNodeData
} from '@shared/canvas-schema'
import { VIDEO_OPERATIONS, type VideoOperationId } from '@shared/operation-schema'
import type { GeneratedAsset } from '@shared/generation'
import type { DirectorStageDoc } from '@shared/stage-schema'
import {
  applyCanvasBatch,
  type CanvasCommand,
  type CanvasCommandChange
} from '@shared/canvas-commands'
import { clearEdgeReferences } from './edge-references'
import {
  externalWrite,
  CineNode,
  StudioNode,
  StageNode,
  FilmNode,
  VideoOpNode,
  GroupNode,
  CanvasNode,
  CineEdge,
  commandTurns,
  isGroupNode,
  isMediaNode,
  isStudioNode,
  isStageNode,
  isFilmNode,
  isVideoOpNode,
  nodeSize,
  nodeOutputs,
  selectedNodeOutput,
  Snapshot,
  NodeClipboard,
  HISTORY_LIMIT,
  cloneSnapshot,
  GroupArrangeMode,
  AddAssetLayout,
  CreateGroupOptions,
  remapNodeReferences,
  remapEdges
} from './canvas-model'

export * from './canvas-model'
import { createViewportSlice } from './canvas/slices/viewport'
import { createGraphSlice } from './canvas/slices/graph'
import { createAssetsSlice } from './canvas/slices/assets'
import { createGroupsSlice } from './canvas/slices/groups'
import { createHistorySlice } from './canvas/slices/history'

export interface CanvasStore {
  nodes: CanvasNode[]
  edges: CineEdge[]
  viewport: Viewport
  hydrated: boolean
  past: Snapshot[]
  future: Snapshot[]
  clipboard: NodeClipboard | null
  boxSelecting: boolean

  loadCanvas: (nodes: CanvasNode[], edges: CineEdge[], viewport: Viewport) => void
  setBoxSelecting: (value: boolean) => void
  setViewport: (viewport: Viewport) => void
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
  onEdgesChange: (changes: EdgeChange<CineEdge>[]) => void
  removeEdges: (edgeIds: string[], turnId?: string) => number
  onConnect: (connection: Connection | { source: string; target: string }) => void
  addNode: (kind: NodeKind, position: XYPosition) => string
  addStudioNode: (position: XYPosition, title?: string) => string
  addStageNode: (doc: DirectorStageDoc, position: XYPosition) => string
  addVideoOpNode: (
    sourceNodeId: string,
    operation: VideoOperationId,
    position?: XYPosition,
    title?: string
  ) => string
  patchStudioNode: (nodeId: string, patch: Partial<StudioNodeData>) => void
  patchStageNode: (nodeId: string, patch: Partial<StageNodeData>) => void
  patchVideoOpNode: (nodeId: string, patch: Partial<VideoOpNodeData>) => void
  setStudioFilmStatus: (studioNodeId: string, filmStatus: FilmStatus) => void
  applyStudioOutput: (studioNodeId: string, output: OutputRef) => void
  detachStudioOutput: (studioNodeId: string) => string | null
  addAssetNodes: (
    kind: NodeKind,
    origin: XYPosition,
    assets: GeneratedAsset[],
    titlePrefix: string,
    sourceNodeId?: string,
    layout?: AddAssetLayout
  ) => string[]
  addPendingNodes: (
    kind: NodeKind,
    origin: XYPosition,
    count: number,
    titlePrefix: string,
    sourceNodeId?: string,
    layout?: AddAssetLayout
  ) => string[]
  createGroupFromNodes: (
    nodeIds: string[],
    options?: CreateGroupOptions
  ) => string | null
  applyOutput: (nodeId: string, asset: GeneratedAsset, op?: string) => void
  patchNodeData: (nodeId: string, patch: Partial<CineNodeData>) => void
  applyCommands: (
    commands: CanvasCommand[],
    turnId?: string
  ) => CanvasCommandChange
  endCommandTurn: (turnId: string) => void
  /** 工具直接写 store 前调用：一轮只压一条历史，批次内的 pushHistory 不再重复压栈 */
  beginToolTurn: (turnId?: string) => void
  endToolTurn: () => void
  resizeNode: (nodeId: string, height: number) => void
  removeNode: (id: string) => void
  clearSelection: () => void
  arrangeNodes: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  copySelection: () => number
  pasteNodes: (
    position?: XYPosition,
    studioTimelines?: Map<string, string>,
    stageDocs?: Map<string, string>
  ) => number
  duplicateSelection: (
    studioTimelines?: Map<string, string>,
    stageDocs?: Map<string, string>
  ) => number
  removeSelection: () => number
  removeNodesByIds: (ids: string[]) => number
  convertFilmToMedia: (filmId: string, detach?: boolean) => boolean
  groupSelection: (turnId?: string) => string | null
  mergeSelection: () => string | null
  createStoryboard: () => string | null
  arrangeStoryboard: (groupId: string) => void
  setGroupMode: (groupId: string, mode: GroupMode) => void
  setStoryboardGrid: (groupId: string, cols: number, rows: number) => void
  setStoryboardRatio: (groupId: string, ratio: GroupRatio) => void
  toggleStoryboardIndex: (groupId: string) => void
  clearGroupChildren: (groupId: string) => number
  ungroup: (groupId: string, turnId?: string) => void
  deleteGroupWithChildren: (groupId: string) => number
  renameGroup: (groupId: string, title: string) => void
  setGroupColor: (groupId: string, color: GroupColor) => void
  arrangeGroup: (groupId: string, mode: GroupArrangeMode) => void
  detachNode: (nodeId: string) => void
  syncGroupBounds: (groupId: string) => void
}

export const useCanvasStore = create<CanvasStore>((set, get, api) => ({
nodes: [],
edges: [],
viewport: { x: 0, y: 0, zoom: 1 },
hydrated: false,
past: [],
future: [],
clipboard: null,
boxSelecting: false,
  ...createViewportSlice(set, get, api),
  ...createGraphSlice(set, get, api),
  ...createAssetsSlice(set, get, api),
  ...createGroupsSlice(set, get, api),
  ...createHistorySlice(set, get, api)
}))
// 开发期调试：供 scripts/cdp-*.mjs 访问画布状态
if (import.meta.env.DEV) {
  ;(window as unknown as { __canvasStore?: typeof useCanvasStore }).__canvasStore =
    useCanvasStore
}
