import { useEffect, useState } from 'react'
import type { AgentMessage } from '../agentStore'
import { Icon } from '../../components/Icon'
import { toolLabel } from './utils'

const DOT_CLASS: Record<string, string> = {
  ok: 'bg-success',
  error: 'bg-danger',
  running: 'bg-warning animate-pulse'
}

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
      className="group shrink-0 overflow-hidden rounded-card border border-border bg-surface"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-2.5 py-[7px] text-[11px] text-fg-muted [&::-webkit-details-marker]:hidden">
        <Icon name="sparkles" size={12} />
        <span>思考过程</span>
        <small className="text-[10px] text-fg-subtle">{tools.length} 步</small>
        <Icon
          name="chevron-down"
          size={12}
          className="ml-auto transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-0.5 px-2.5 pb-[9px] pt-1">
        {tools.map((tool) => {
          const status = tool.toolStatus ?? 'running'
          return (
            <div
              key={tool.id}
              className="flex flex-wrap items-center gap-[7px] py-1 text-[11px] text-fg-subtle"
            >
              <span
                className={`size-[5px] shrink-0 rounded-full ${
                  DOT_CLASS[status] ?? ''
                }`}
              />
              <span className="text-fg-muted">
                {toolLabel(tool.toolName ?? '')}
              </span>
              <span
                className={`ml-auto text-[10px] ${
                  status === 'error' ? 'text-danger' : 'text-fg-subtle'
                }`}
              >
                {status === 'running'
                  ? '执行中'
                  : status === 'error'
                    ? '未完成'
                    : '完成'}
              </span>
              {status === 'error' ? (
                <div className="ml-3 basis-full text-[10px] leading-[1.5] text-danger">
                  {tool.content}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}
