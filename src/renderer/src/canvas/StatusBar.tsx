import { Icon } from '../components/Icon'

export function StatusBar() {
  return (
    <div className="statusbar">
      <button className="statusbar__item">
        <Icon name="folder" size={13} />
        资产管理
      </button>
      <button className="statusbar__item">
        <Icon name="grid" size={13} />
        网格
      </button>
      <button className="statusbar__item">
        <Icon name="droplet" size={13} />
        水印
      </button>
      <button className="statusbar__item" title="导出">
        <Icon name="download" size={13} />
      </button>
      <span className="statusbar__item">100%</span>
    </div>
  )
}
