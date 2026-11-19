import type {
  AgentPermissionMode,
  AgentScope,
  AgentToolCall
} from '@shared/agent'
import { assertToolAllowed, toolConfirmationReason } from '../tools'

/**
 * B1：pi 不自带权限系统，规则仍由 CineLab 拥有。
 * pi 的 extension `tool_call` 只负责把结果转成 block。
 */
export function piPermissionBlock(
  call: AgentToolCall,
  scope: AgentScope,
  permissionMode: AgentPermissionMode
): string | null {
  try {
    assertToolAllowed(call, scope, permissionMode)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : '工具不可用'
  }
}

export function piConfirmationReason(call: AgentToolCall): string | null {
  return toolConfirmationReason(call)
}
