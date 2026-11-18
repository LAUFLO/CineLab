import { effectiveCapabilities } from '@shared/capabilities'
import { log } from '../logger'
import { listProviders } from './store'

/**
 * 启动时汇总一次「模型声明了但适配器没实现」的能力缺口。
 * 只写日志，不阻塞启动；设置页会单独展示。
 */
export async function reportCapabilityGaps(): Promise<void> {
  try {
    const providers = await listProviders()
    const gaps = providers.flatMap((provider) =>
      provider.models.flatMap((model) =>
        effectiveCapabilities(model).gaps.map((gap) => ({
          provider: provider.id,
          model: model.id,
          kind: gap.kind,
          value: gap.value,
          message: gap.message
        }))
      )
    )

    if (gaps.length > 0) {
      log.warn('capability gaps detected', { count: gaps.length, gaps })
    }
  } catch (error) {
    log.warn('capability gap report failed', error)
  }
}
