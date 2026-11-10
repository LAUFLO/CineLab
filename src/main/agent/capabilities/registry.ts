import { AGENT_TOOLS } from '../tools'
import {
  capabilitySummary,
  capabilitiesForProfile,
  listAgentCapabilities,
  toAgentCapability
} from './types'

/**
 * 能力注册表投影。
 * 工具执行的唯一来源仍是 tools.ts 的 AGENT_TOOLS；这里不重复维护执行逻辑。
 */
export const AGENT_CAPABILITIES = listAgentCapabilities(AGENT_TOOLS)

export {
  capabilitySummary,
  capabilitiesForProfile,
  listAgentCapabilities,
  toAgentCapability
}

export function findCapability(toolName: string) {
  return AGENT_CAPABILITIES.find((item) => item.toolName === toolName)
}
