export interface VideoOperationDef {
  id: 'shot-retake' | 'element-replace' | 'extend' | 'intro'
  label: string
  description: string
}

export const VIDEO_OPERATIONS: VideoOperationDef[] = [
  {
    id: 'shot-retake',
    label: '片段重拍',
    description: '把当前视频提交给专用重拍接口，返回重拍后的视频'
  },
  {
    id: 'element-replace',
    label: '元素替换',
    description: '把当前视频提交给专用元素替换接口'
  },
  {
    id: 'extend',
    label: '智能续写',
    description: '把当前视频提交给专用视频延长接口'
  },
  {
    id: 'intro',
    label: '创意片头',
    description: '把当前视频提交给专用片头生成接口'
  }
]

export type OperationBindings = Record<string, string>

export function isVideoOperation(id: string): boolean {
  return VIDEO_OPERATIONS.some((operation) => operation.id === id)
}
