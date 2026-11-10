import type { TimelinePlan } from '@shared/timeline-tools'
import { useTimelineStore } from '../stores/timeline'

export interface ApplyTimelinePlanOptions {
  /** 撤销历史里显示的名称 */
  label?: string
  /** 同一轮 Agent 的命令合并为一条历史 */
  turnId?: string
  clearSelection?: boolean
}

/**
 * 把自动粗剪计划落到时间线。
 * UI 的确认卡和 Agent 的时间线工具共用这一个执行器。
 */
export function applyTimelinePlan(
  plan: TimelinePlan,
  options: ApplyTimelinePlanOptions = {}
): boolean {
  if (plan.commands.length === 0) return false
  const store = useTimelineStore.getState()
  if (!store.doc) return false

  store.dispatchMany(
    options.label
      ? [
          {
            op: 'batch',
            label: options.label,
            commands: plan.commands
          }
        ]
      : plan.commands,
    options.turnId
  )
  if (options.clearSelection) store.select([])
  return true
}
