/**
 * pi 是 ESM-only，主进程是 CJS，且包的 exports 没有 require 条件。
 * 这里用运行时动态 import 加载，避免 TypeScript/Rollup 把 import() 降级成 require()。
 */
import type * as PiAi from '@earendil-works/pi-ai'
import type * as PiCodingAgent from '@earendil-works/pi-coding-agent'

type DynamicImport = (specifier: string) => Promise<unknown>

const dynamicImport = new Function(
  'specifier',
  'return import(specifier)'
) as DynamicImport

let codingAgentPromise: Promise<typeof PiCodingAgent> | null = null
let piAiPromise: Promise<typeof PiAi> | null = null

export function loadPiCodingAgent(): Promise<typeof PiCodingAgent> {
  codingAgentPromise ??= dynamicImport(
    '@earendil-works/pi-coding-agent'
  ) as Promise<typeof PiCodingAgent>
  return codingAgentPromise
}

export function loadPiAi(): Promise<typeof PiAi> {
  piAiPromise ??= dynamicImport('@earendil-works/pi-ai') as Promise<
    typeof PiAi
  >
  return piAiPromise
}
