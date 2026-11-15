import type { AgentProposal } from '@shared/agent'
import { proposalStatusLabel } from '@shared/agent-proposal'
import { nodeOperationOutputTarget } from '@shared/node-operation-specs'
import { Button } from '../../components/ui'

const ROW = 'flex items-baseline justify-between gap-3 py-0.5'
const ROW_LABEL = 'shrink-0 text-fg-subtle'
const ROW_VALUE = 'truncate text-right font-medium text-fg'

const BORDER_CLASS: Record<string, string> = {
  pending: 'border-[color-mix(in_srgb,var(--accent)_55%,var(--border-strong))]',
  failed: 'border-[color-mix(in_srgb,var(--danger)_40%,var(--border))]'
}

const STATUS_CLASS: Record<string, string> = {
  pending:
    'text-fg [background:color-mix(in_srgb,var(--accent)_16%,transparent)]',
  submitted:
    'text-success [background:color-mix(in_srgb,var(--success)_16%,transparent)]',
  completed:
    'text-success [background:color-mix(in_srgb,var(--success)_16%,transparent)]',
  failed:
    'text-danger [background:color-mix(in_srgb,var(--danger)_14%,transparent)]',
  expired:
    'text-danger [background:color-mix(in_srgb,var(--danger)_14%,transparent)]'
}

export function ProposalCard({
  proposal,
  busy,
  onSubmit,
  onCancel
}: {
  proposal: AgentProposal
  busy: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const pending = proposal.status === 'pending'
  const outputTarget =
    proposal.outputTarget ?? nodeOperationOutputTarget(proposal.request.op)
  const params = Object.entries(proposal.request.params)
    .filter(
      ([key, value]) =>
        key !== 'negative_prompt' &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean')
    )
    .slice(0, 5)
    .map(([key, value]) => `${key}=${String(value)}`)
  const refNames = [
    ...(proposal.request.refs ?? []).map(
      (ref) => ref.path.split('/').pop() ?? ref.path
    ),
    ...(proposal.request.video
      ? [
          proposal.request.video.path.split('/').pop() ??
            proposal.request.video.path
        ]
      : [])
  ]

  return (
    <section
      className={`mx-3 mb-2 shrink-0 rounded-[10px] border bg-surface p-2.5 text-[11px] ${
        BORDER_CLASS[proposal.status] ?? 'border-border-strong'
      }`}
    >
      <header className="mb-[7px] flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg">生成提案</span>
        <span
          className={`rounded-full px-1.5 py-px text-[10px] ${
            STATUS_CLASS[proposal.status] ?? 'bg-surface-hover text-fg-subtle'
          }`}
        >
          {proposalStatusLabel(proposal.status)}
        </span>
      </header>
      <div className={ROW}>
        <span className={ROW_LABEL}>节点</span>
        <strong className={ROW_VALUE}>
          {proposal.nodeTitle || proposal.request.nodeId}
        </strong>
      </div>
      <div className={ROW}>
        <span className={ROW_LABEL}>输出</span>
        <strong className={ROW_VALUE}>
          {outputTarget === 'new-node' ? '新建节点并连线' : '写回当前节点版本'}
        </strong>
      </div>
      <div className={ROW}>
        <span className={ROW_LABEL}>模型</span>
        <strong className={ROW_VALUE}>{proposal.modelName}</strong>
      </div>
      {refNames.length > 0 ? (
        <div className={ROW}>
          <span className={ROW_LABEL}>引用</span>
          <strong className={ROW_VALUE} title={refNames.join('、')}>
            {refNames.length} 个 · {refNames.slice(0, 2).join('、')}
            {refNames.length > 2 ? ' …' : ''}
          </strong>
        </div>
      ) : null}
      {params.length > 0 ? (
        <div className={ROW}>
          <span className={ROW_LABEL}>参数</span>
          <strong className={ROW_VALUE}>{params.join(' · ')}</strong>
        </div>
      ) : null}
      <div className={ROW}>
        <span className={ROW_LABEL}>数量</span>
        <strong className={ROW_VALUE}>{proposal.count}</strong>
      </div>
      <div className="mt-1.5 max-h-[66px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-border bg-surface-raised px-2 py-1.5 leading-[1.5] text-fg-muted">
        {proposal.request.prompt}
      </div>
      {proposal.error ? (
        <div className="mt-1.5 leading-[1.5] text-danger">{proposal.error}</div>
      ) : null}
      {pending ? (
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            className="!rounded-[6px] px-2.5 py-1 text-[11px] !font-normal disabled:!opacity-50"
            onClick={onSubmit}
            disabled={busy}
            variant="primary"
            size="none"
          >
            {busy ? '提交中…' : '确认生成'}
          </Button>
          <Button
            type="button"
            className="!rounded-[6px] px-2.5 py-1 text-[11px] !font-normal disabled:!opacity-50"
            onClick={onCancel}
            disabled={busy}
            variant="secondary"
            size="none"
          >
            取消
          </Button>
        </div>
      ) : proposal.status === 'submitted' ? (
        <div className="mt-1.5 leading-[1.5] text-fg-subtle">
          {outputTarget === 'new-node'
            ? '已提交，生成完成后会写入新节点并连线。'
            : '已提交，生成完成后会自动写回节点。'}
        </div>
      ) : proposal.status === 'failed' ? (
        <div className="mt-1.5 leading-[1.5] text-fg-subtle">
          该提案已提交过，不会重复扣费；请让 CineBot 重新生成。
        </div>
      ) : proposal.status === 'expired' ? (
        <div className="mt-1.5 leading-[1.5] text-fg-subtle">
          提案已失效，请让 CineBot 重新生成。
        </div>
      ) : null}
    </section>
  )
}
