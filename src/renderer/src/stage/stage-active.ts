let activeNodeId: string | null = null

export function setActiveStageNode(nodeId: string | null): void {
  activeNodeId = nodeId
}

export function activeStageNodeId(): string | null {
  return activeNodeId
}
