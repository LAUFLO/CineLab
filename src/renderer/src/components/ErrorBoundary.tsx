import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui'

interface ErrorBoundaryProps {
  children: ReactNode
  label?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 捕获子树渲染异常，避免单个组件报错导致整页白屏。
 * 只处理渲染阶段错误；事件回调和异步任务仍需各自兜底。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      '[ErrorBoundary]',
      this.props.label ?? '',
      error,
      info.componentStack
    )
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-sm font-medium text-fg">
          {this.props.label ?? '这个区域出错了'}
        </div>
        <div className="max-w-[420px] break-words text-xs text-fg-muted">
          {error.message}
        </div>
        <Button onClick={this.reset}>重试</Button>
      </div>
    )
  }
}
