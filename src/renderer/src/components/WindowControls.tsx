import { Icon } from './Icon'

export function WindowControls() {
  return (
    <div className="window-controls">
      <button
        type="button"
        className="icon-btn icon-btn--window"
        title="最小化"
        onClick={() => window.api.app.minimize()}
      >
        <Icon name="minimize" size={14} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--window"
        title="最大化"
        onClick={() => window.api.app.maximize()}
      >
        <Icon name="maximize" size={12} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--window icon-btn--close"
        title="关闭"
        onClick={() => window.api.app.close()}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
