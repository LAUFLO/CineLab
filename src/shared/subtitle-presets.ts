import type { TextStyle } from './timeline-schema'

export interface SubtitlePreset {
  id: string
  name: string
  style: Partial<Omit<TextStyle, 'content'>>
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: 'clean',
    name: '简洁白字',
    style: {
      fontFamily: 'Arial',
      fontSize: 64,
      color: '#ffffff',
      bold: false,
      italic: false,
      align: 'center',
      stroke: { color: '#000000', width: 2 },
      shadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 2 },
      background: undefined
    }
  },
  {
    id: 'yellow-plate',
    name: '黑底黄字',
    style: {
      fontFamily: 'Arial',
      fontSize: 56,
      color: '#ffd400',
      bold: true,
      italic: false,
      align: 'center',
      stroke: undefined,
      shadow: undefined,
      background: { color: '#000000', padding: 18, radius: 6 }
    }
  },
  {
    id: 'title',
    name: '大字标题',
    style: {
      fontFamily: 'Arial Black',
      fontSize: 96,
      color: '#ffffff',
      bold: true,
      italic: false,
      align: 'center',
      stroke: { color: '#000000', width: 8 },
      shadow: { color: '#000000', blur: 12, offsetX: 0, offsetY: 4 },
      background: undefined
    }
  },
  {
    id: 'news',
    name: '底部新闻条',
    style: {
      fontFamily: 'Arial',
      fontSize: 40,
      color: '#ffffff',
      bold: false,
      italic: false,
      align: 'left',
      stroke: undefined,
      shadow: undefined,
      background: { color: '#111111', padding: 12, radius: 4 }
    }
  },
  {
    id: 'yellow-pop',
    name: '黄色强调',
    style: {
      fontFamily: 'Arial',
      fontSize: 72,
      color: '#ffe066',
      bold: true,
      italic: false,
      align: 'center',
      stroke: { color: '#3a2c00', width: 4 },
      shadow: { color: '#000000', blur: 10, offsetX: 0, offsetY: 3 },
      background: undefined
    }
  }
]
