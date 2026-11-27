import { describe, expect, it } from 'vitest'
import type { AgentMessage } from '../agentStore'
import { buildRows } from '../panel/ThoughtGroup'

function tool(
  id: string,
  name: string,
  status: 'running' | 'ok' | 'error',
  content = ''
): AgentMessage {
  return {
    id,
    role: 'tool',
    content,
    toolName: name,
    toolStatus: status
  }
}

describe('ThoughtGroup buildRows', () => {
  it('聚合相邻同工具的连续失败', () => {
    const rows = buildRows([
      tool('1', 'stage_set_camera_track', 'error', '关键帧 easing 无效'),
      tool('2', 'stage_set_camera_track', 'error', '关键帧 easing 无效'),
      tool('3', 'stage_set_camera_track', 'error', '关键帧 easing 无效')
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'stage_set_camera_track',
      status: 'error',
      count: 3,
      errors: ['关键帧 easing 无效']
    })
  })

  it('不同工具或成功项不聚合', () => {
    const rows = buildRows([
      tool('1', 'stage_add_objects', 'ok'),
      tool('2', 'stage_set_camera_track', 'error', '失败 A'),
      tool('3', 'stage_update_shot', 'error', '失败 B')
    ])

    expect(rows.map((row) => [row.name, row.status, row.count])).toEqual([
      ['stage_add_objects', 'ok', 1],
      ['stage_set_camera_track', 'error', 1],
      ['stage_update_shot', 'error', 1]
    ])
  })

  it('保留同一工具的不同失败原因', () => {
    const rows = buildRows([
      tool('1', 'stage_set_camera_track', 'error', '失败 A'),
      tool('2', 'stage_set_camera_track', 'error', '失败 B')
    ])

    expect(rows[0].errors).toEqual(['失败 A', '失败 B'])
  })

  it('空工具列表返回空结果', () => {
    expect(buildRows([])).toEqual([])
  })
})
