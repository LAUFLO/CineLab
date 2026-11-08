export type VideoOperationId = 'shot-retake' | 'element-replace' | 'extend'

export interface VideoOperationDef {
  id: VideoOperationId
  label: string
  description: string
  /** 接口模板建议使用的变量 */
  variables: string[]
  /** 接口返回类型说明 */
  resultHint: string
}

export const VIDEO_OPERATIONS: VideoOperationDef[] = [
  {
    id: 'shot-retake',
    label: '片段重拍',
    description:
      '只重新生成指定时间区间的画面，其余部分保持不变。接口返回完整视频，或返回片段由 CineLab 自动拼回原视频。',
    variables: [
      '{{video.dataUrl}}',
      '{{prompt}}',
      '{{video.start}}',
      '{{video.end}}',
      '{{video.operation}}'
    ],
    resultHint: '建议在模板中声明 videoResult：完整视频填 full，新增片段填 segment。'
  },
  {
    id: 'element-replace',
    label: '元素替换',
    description:
      '用参考图替换视频中的指定元素，其余画面保持不变。参考图放在 refs 中，接口通过 {{refs.images}} 读取。',
    variables: [
      '{{video.dataUrl}}',
      '{{prompt}}',
      '{{video.start}}',
      '{{video.end}}',
      '{{refs.images}}',
      '{{video.operation}}'
    ],
    resultHint: '建议在模板中声明 videoResult：完整视频填 full，新增片段填 segment。'
  },
  {
    id: 'extend',
    label: '智能续写',
    description:
      '以视频首帧或尾帧为锚点延长一段。向后延长拼接在原视频之后，向前延长拼接在原视频之前。',
    variables: [
      '{{video.dataUrl}}',
      '{{prompt}}',
      '{{video.duration}}',
      '{{video.direction}}',
      '{{video.operation}}'
    ],
    resultHint: '建议在模板中声明 videoResult：完整视频填 full，新增片段填 segment。'
  }
]

export type OperationBindings = Record<string, string>

export function isVideoOperation(id: string): boolean {
  return VIDEO_OPERATIONS.some((operation) => operation.id === id)
}
