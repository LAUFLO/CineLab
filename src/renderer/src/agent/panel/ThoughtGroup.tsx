import { useEffect, useMemo, useState } from 'react'
import type { AgentMessage } from '../agentStore'
import { Icon } from '../../components/Icon'
import { toolLabel } from './utils'

type ToolStatus = 'running' | 'ok' | 'error'

const DOT_CLASS: Record<ToolStatus, string> = {
  ok: 'bg-success',
  error: 'bg-danger',
  running: 'bg-warning animate-pulse'
}

interface ToolRow {
  key: string
  name: string
  status: ToolStatus
  count: number
  errors: string[]
}

export function buildRows(tools: AgentMessage[]): ToolRow[] {
  const rows: ToolRow[] = []
  for (const tool of tools) {
    const status = tool.toolStatus ?? 'running'
    const name = tool.toolName ?? ''
    const last = rows[rows.length - 1]
    if (
      last &&
      last.status === 'error' &&
      status === 'error' &&
      last.name === name
    ) {
      last.count += 1
      if (tool.content && !last.errors.includes(tool.content)) {
        last.errors.push(tool.content)
      }
      continue
    }
    rows.push({
      key: tool.id,
      name,
      status,
      count: 1,
      errors: status === 'error' && tool.content ? [tool.content] : []
    })
  }
  return rows
}

export function ThoughtGroup({ tools }: { tools: AgentMessage[] }) {
  const hasProblem = tools.some(
    (tool) => tool.toolStatus === 'error' || tool.toolStatus === 'running'
  )
  const [open, setOpen] = useState(hasProblem)
  const rows = useMemo(() => buildRows(tools), [tools])

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
        {rows.map((row) => {
          const statusLabel =
            row.status === 'running'
              ? '执行中'
              : row.status === 'error'
                ? row.count > 1
                  ? `失败 ${row.count} 次`
                  : '失败'
                : '完成'
          return (
            <div
              key={row.key}
              className={`flex flex-col gap-1 rounded-md py-1 text-[11px] ${
                row.status === 'error'
                  ? 'bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-1.5'
                  : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`size-[5px] shrink-0 rounded-full ${DOT_CLASS[row.status]}`}
                />
                <span className="min-w-0 truncate text-fg-muted">
                  {toolLabel(row.name)}
                </span>
                <span
                  className={`ml-auto shrink-0 text-[10px] ${
                    row.status === 'error' ? 'text-danger' : 'text-fg-subtle'
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
              {row.status === 'error' && row.errors.length > 0 ? (
                <div
                  className="line-clamp-2 pl-[11px] text-[10px] leading-[1.5] text-danger"
                  title={row.errors.join('\n')}
                >
                  {row.errors.join('\n')}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}
