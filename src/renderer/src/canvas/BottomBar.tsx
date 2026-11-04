import { Icon } from '../components/Icon'

export function BottomBar() {
  return (
    <div className="bottombar">
      <button className="icon-btn" title="添加节点">
        <Icon name="plus" />
      </button>

      <div className="bottombar__divider" />

      <button className="icon-btn" title="选择工具">
        <Icon name="cursor" />
      </button>
      <button className="icon-btn" title="框选工具">
        <Icon name="frame" />
      </button>

      <div className="bottombar__divider" />

      <button className="icon-btn" title="生成历史">
        <Icon name="history" />
      </button>
      <button className="icon-btn" title="快捷键">
        <Icon name="help" />
      </button>
      <button className="icon-btn" title="设置">
        <Icon name="settings" />
      </button>

      <button className="bottombar__agent" title="AI 助手（即将支持）" />
    </div>
  )
}
