import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { componentDirectory } from '../components/service'

/** 本地 AI 运行时自带的 Python；内部组件 kind 仍叫 depth-runtime。 */
export function pythonBinary(): string {
  const root = componentDirectory('depth-runtime')
  return process.platform === 'win32'
    ? join(root, 'python', 'python.exe')
    : join(root, 'python', 'bin', 'python3')
}

/** 结束进程树。Windows 下 Python 可能拉起子进程，必须用 taskkill /T。 */
export function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // 进程可能已经退出
  }
}
