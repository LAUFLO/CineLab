import type { AgentProposal } from '@shared/agent'
import { proposalStatusLabel } from '@shared/agent-proposal'
import { nodeOperationOutputTarget } from '@shared/node-operation-specs'
import { Button } from '../../components/ui'

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
    <section className={`agent-proposal agent-proposal--${proposal.status}`}>
      <header className="agent-proposal__head">
        <span className="agent-proposal__title">生成提案</span>
        <span className="agent-proposal__status">
          {proposalStatusLabel(proposal.status)}
        </span>
      </header>
      <div className="agent-proposal__row">
        <span>节点</span>
        <strong>{proposal.nodeTitle || proposal.request.nodeId}</strong>
      </div>
      <div className="agent-proposal__row">
        <span>输出</span>
        <strong>
          {outputTarget === 'new-node' ? '新建节点并连线' : '写回当前节点版本'}
        </strong>
      </div>
      <div className="agent-proposal__row">
        <span>模型</span>
        <strong>{proposal.modelName}</strong>
      </div>
      {refNames.length > 0 ? (
        <div className="agent-proposal__row">
          <span>引用</span>
          <strong title={refNames.join('、')}>
            {refNames.length} 个 · {refNames.slice(0, 2).join('、')}
            {refNames.length > 2 ? ' …' : ''}
          </strong>
        </div>
      ) : null}
      {params.length > 0 ? (
        <div className="agent-proposal__row">
          <span>参数</span>
          <strong>{params.join(' · ')}</strong>
        </div>
      ) : null}
      <div className="agent-proposal__row">
        <span>数量</span>
        <strong>{proposal.count}</strong>
      </div>
      <div className="agent-proposal__prompt">{proposal.request.prompt}</div>
      {proposal.error ? (
        <div className="agent-proposal__error">{proposal.error}</div>
      ) : null}
      {pending ? (
        <div className="agent-proposal__actions">
          <Button
            type="button"
            className="agent-proposal__confirm"
            onClick={onSubmit}
            disabled={busy}
            unstyled
          >
            {busy ? '提交中…' : '确认生成'}
          </Button>
          <Button
            type="button"
            className="agent-proposal__cancel"
            onClick={onCancel}
            disabled={busy}
            unstyled
          >
            取消
          </Button>
        </div>
      ) : proposal.status === 'submitted' ? (
        <div className="agent-proposal__hint">
          {outputTarget === 'new-node'
            ? '已提交，生成完成后会写入新节点并连线。'
            : '已提交，生成完成后会自动写回节点。'}
        </div>
      ) : proposal.status === 'failed' ? (
        <div className="agent-proposal__hint">
          该提案已提交过，不会重复扣费；请让 CineBot 重新生成。
        </div>
      ) : proposal.status === 'expired' ? (
        <div className="agent-proposal__hint">
          提案已失效，请让 CineBot 重新生成。
        </div>
      ) : null}
    </section>
  )
}
