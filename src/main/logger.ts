import { app } from 'electron'
import { join } from 'node:path'
import log from 'electron-log/main'

let configured = false

export function setupLogging(): void {
  if (configured) return
  configured = true

  log.transports.file.resolvePathFn = () =>
    join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.console.level = 'info'

  try {
    log.errorHandler.startCatching({ showDialog: false })
  } catch {
    // 日志初始化失败不能影响应用启动
  }

  log.info('logger initialized', {
    version: app.getVersion(),
    platform: process.platform
  })
}

export function logDirectory(): string {
  return join(app.getPath('userData'), 'logs')
}

export { log }
