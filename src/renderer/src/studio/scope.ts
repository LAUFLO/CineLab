/**
 * 剪辑室打开时，画布的全局快捷键必须让位。
 * 用 DOM 查询而不是 store，避免画布与剪辑室互相依赖。
 */
export function studioOpen(): boolean {
  return Boolean(document.querySelector('.studio-window'))
}
