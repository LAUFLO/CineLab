import type { CanvasData } from './project-schema'

export type ProjectTemplateId = string

export interface ProjectTemplate {
  id: string
  name: string
  description: string
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: '空白项目',
    description: '从一块空画布开始'
  }
]

export function buildTemplateCanvas(
  _templateId: string,
  canvasId: string
): CanvasData {
  return {
    schemaVersion: 1,
    id: canvasId,
    name: '画布 1',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: []
  }
}
