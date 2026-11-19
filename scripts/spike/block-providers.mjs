/**
 * 通过 Node 24 的 module.registerHooks 拦截指定包，验证运行时是否真的加载它们。
 *
 * 用法：
 *   $env:PI_BLOCK='openai,@anthropic-ai,@google,@aws-sdk,@smithy' ; node --import ./scripts/spike/block-providers.mjs scripts/spike/pi-smoke.mjs
 */
import { registerHooks } from 'node:module'

const patterns = (process.env.PI_BLOCK ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (patterns.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
      throw new Error(`BLOCKED:${specifier}`)
    }
    return nextResolve(specifier, context)
  }
})
