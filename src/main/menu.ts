import { app, Menu, type MenuItemConstructorOptions } from 'electron'

export function installApplicationMenu(): void {
  if (process.platform !== 'darwin') return

  app.setAboutPanelOptions({
    applicationName: 'CineLab',
    applicationVersion: app.getVersion()
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'CineLab',
      submenu: [
        { role: 'about', label: '关于 CineLab' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 CineLab' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 CineLab' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
