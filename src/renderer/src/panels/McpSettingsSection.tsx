import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  McpConfigInfo,
  McpServerStatus,
  McpToolInfo
} from '@shared/ipc-contract'
import { Icon } from '../components/Icon'
import { Button, Switch } from '../components/ui'
import { usePreferencesStore } from '../stores/preferences'
import { useUIStore } from '../stores/ui'

function toolTone(tool: McpToolInfo): string {
  if (tool.destructive) return 'border-danger/40 text-danger'
  if (tool.readOnly) return 'border-border text-fg-subtle'
  return 'border-accent/40 text-accent'
}

function InfoRow({
  label,
  value,
  children
}: {
  label: string
  value: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="w-16 shrink-0 pt-0.5 text-[11px] text-fg-subtle">
        {label}
      </div>
      <div className="min-w-0 flex-1 break-all font-mono text-[11px] leading-[1.6] text-fg-muted">
        {value}
      </div>
      {children ? (
        <div className="flex shrink-0 gap-1">{children}</div>
      ) : null}
    </div>
  )
}

export function McpSettingsSection(): React.JSX.Element {
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateMcp = usePreferencesStore((state) => state.updateMcp)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const [status, setStatus] = useState<McpServerStatus | null>(null)
  const [config, setConfig] = useState<McpConfigInfo | null>(null)
  const [tokenVisible, setTokenVisible] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextStatus, nextConfig] = await Promise.all([
        window.api.mcp.status(),
        window.api.mcp.config()
      ])
      setStatus(nextStatus)
      setConfig(nextConfig)
    } catch {
      setStatus(null)
      setConfig(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const copy = async (text: string, label: string): Promise<void> => {
    if (!text) return
    await window.api.mcp.copy(text)
    showToast(`${label}已复制`)
  }

  const resetToken = (): void => {
    requestConfirm({
      title: '重置 MCP token',
      message:
        '旧 token 会立即失效，已连接的客户端需要更新配置后重新连接。重置后请重新复制客户端配置。',
      confirmLabel: '重置',
      danger: true,
      onConfirm: async () => {
        await window.api.mcp.resetToken()
        await refresh()
        showToast('MCP token 已重置')
      }
    })
  }

  const httpConfig = useMemo(() => {
    if (!config) return ''
    return JSON.stringify(
      {
        mcpServers: {
          cinelab: {
            url: config.url,
            headers: { Authorization: `Bearer ${config.token}` }
          }
        }
      },
      null,
      2
    )
  }, [config])

  const stdioConfig = useMemo(() => {
    if (!config) return ''
    return JSON.stringify(
      {
        mcpServers: {
          cinelab: {
            command: config.stdio.command,
            args: config.stdio.args,
            ...(config.stdio.env ? { env: config.stdio.env } : {})
          }
        }
      },
      null,
      2
    )
  }, [config])

  const groups = useMemo(() => {
    const map = new Map<string, McpToolInfo[]>()
    for (const tool of status?.tools ?? []) {
      const list = map.get(tool.category) ?? []
      list.push(tool)
      map.set(tool.category, list)
    }
    return [...map.entries()]
  }, [status])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-medium text-fg">MCP server</div>
        <p className="mt-1 text-xs leading-[1.6] text-fg-muted">
          外部 Agent 通过 MCP 连接 CineLab，可读取项目与画布、操作节点、时间线、导演台和拉片。
          只监听本机，使用 Bearer token 鉴权。
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12.5px] text-fg">启用 MCP server</div>
            <div className="mt-0.5 text-[11px] text-fg-subtle">
              关闭后不再监听端口，已连接的会话会断开
            </div>
          </div>
          <Switch
            checked={preferences.mcp.enabled}
            label="启用 MCP server"
            onChange={(checked) => {
              void updateMcp({ enabled: checked }).then(refresh)
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12.5px] text-fg">只读模式</div>
            <div className="mt-0.5 text-[11px] text-fg-subtle">
              开启后所有写工具直接拒绝，只保留查询能力
            </div>
          </div>
          <Switch
            checked={preferences.mcp.readOnly}
            label="只读模式"
            onChange={(checked) => {
              void updateMcp({ readOnly: checked }).then(refresh)
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status?.running ? 'bg-success' : 'bg-fg-subtle'
            }`}
          />
          <span className="text-[13px] text-fg">
            {status?.running ? '运行中' : '已停止'}
          </span>
          {status ? (
            <span className="text-[11px] text-fg-subtle">
              v{status.serverVersion}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5">
          <InfoRow label="地址" value={config?.url ?? '尚未启动'}>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void copy(config?.url ?? '', '地址')}
            >
              复制
            </Button>
          </InfoRow>
          <InfoRow label="配置" value={status?.configPath ?? '—'}>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void window.api.mcp.revealConfig()}
            >
              打开目录
            </Button>
          </InfoRow>
          <InfoRow
            label="Token"
            value={
              tokenVisible
                ? (config?.token ?? '—')
                : config
                  ? '••••••••••••••••'
                  : '—'
            }
          >
            <Button
              size="xs"
              variant="secondary"
              onClick={() => setTokenVisible((visible) => !visible)}
            >
              {tokenVisible ? '隐藏' : '显示'}
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void copy(config?.token ?? '', 'Token')}
            >
              复制
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={!status?.running}
              onClick={resetToken}
            >
              重置
            </Button>
          </InfoRow>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12.5px] text-fg">客户端配置</div>
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              disabled={!httpConfig}
              onClick={() => void copy(httpConfig, 'HTTP 配置')}
            >
              复制 HTTP
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={!stdioConfig}
              onClick={() => void copy(stdioConfig, 'stdio 配置')}
            >
              复制 stdio
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-md bg-surface p-2.5 text-[11px] leading-[1.7] text-fg-subtle">
          <div>
            <span className="text-fg-muted">HTTP</span>
            ：客户端直连本机端口，CineLab 需要保持运行；适合配置里能填
            <span className="font-mono">url</span>
            的客户端。
          </div>
          <div>
            <span className="text-fg-muted">stdio</span>
            ：由客户端启动桥接进程转发到本机；适合只能填
            <span className="font-mono">command</span>
            /
            <span className="font-mono">args</span>
            的客户端。
          </div>
          <div>
            不确定时看客户端文档：能填
            <span className="font-mono">url</span>
            就选 HTTP，只能填
            <span className="font-mono">command</span>
            就选 stdio，两者能力一致。
          </div>
        </div>
        <p className="text-[11px] leading-[1.6] text-fg-subtle">
          常用客户端：Claude Desktop、Cursor、Cline、Windsurf、Codex、Trae、Qoder、WorkBuddy 等。应用退出后地址与
          token 会失效，下次启动以本页为准。
        </p>
        <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface p-3 font-mono text-[10.5px] leading-[1.6] text-fg-muted">
          {httpConfig || '启动 MCP server 后生成配置'}
        </pre>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12.5px] text-fg">工具</div>
          <span className="text-[11px] text-fg-subtle">
            {status?.tools.length ?? 0} 个 · 只读{' '}
            {status?.tools.filter((tool) => tool.readOnly).length ?? 0}
          </span>
        </div>
        {groups.length === 0 ? (
          <div className="py-3 text-center text-xs text-fg-subtle">
            暂无可用工具
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map(([category, tools]) => (
              <div key={category}>
                <div className="text-[10.5px] text-fg-subtle">
                  {category} · {tools.length}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tools.map((tool) => (
                    <span
                      key={tool.name}
                      title={tool.title}
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] ${toolTone(tool)}`}
                    >
                      {tool.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Icon name="help" size={12} />
          蓝色为写工具（执行前需在应用内确认），红色为删除类危险操作
        </div>
      </div>
    </div>
  )
}
