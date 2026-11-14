import { useEffect, useState } from 'react'
import type { AgentMessage } from '../agentStore'
import { Icon } from '../../components/Icon'
import { toolLabel } from './utils'

export function ThoughtGroup({ tools }: { tools: AgentMessage[] }) {
  const hasProblem = tools.some(
    (tool) => tool.toolStatus === 'error' || tool.toolStatus === 'running'
  )
  const [open, setOpen] = useState(hasProblem)

  useEffect(() => {
    if (hasProblem) setOpen(true)
  }, [hasProblem])

  return (
    <details
      className="agent-thoughts"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Icon name="sparkles" size={12} />
        <span>思考过程</span>
        <small>{tools.length} 步</small>
        <Icon name="chevron-down" size={12} className="agent-thoughts__chev" />
      </summary>
      <div className="agent-thoughts__list">
        {tools.map((tool) => (
          <div
            key={tool.id}
            className={`agent-thought agent-thought--${tool.toolStatus ?? 'running'}`}
          >
            <span className="agent-thought__dot" />
            <span className="agent-thought__name">
              {toolLabel(tool.toolName ?? '')}
            </span>
            <span className="agent-thought__status">
              {tool.toolStatus === 'running'
                ? '执行中'
                : tool.toolStatus === 'error'
                  ? '未完成'
                  : '完成'}
            </span>
            {tool.toolStatus === 'error' ? (
              <div className="agent-thought__error">{tool.content}</div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  )
}
