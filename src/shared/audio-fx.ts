import type { AudioFxSettings } from './timeline-schema'

export const DEFAULT_AUDIO_FX: AudioFxSettings = {
  denoise: false,
  enhanceVoice: false,
  loudness: false,
  voiceEffect: 'none'
}

/**
 * 把音频清理设置转成 ffmpeg 滤镜片段。
 * 顺序：降噪 → 人声增强 → 变声 → 响度均衡。
 */
export function audioFxFilters(fx?: AudioFxSettings | null): string[] {
  if (!fx) return []

  const filters: string[] = []

  if (fx.denoise) {
    filters.push('afftdn=nf=-25')
  }

  if (fx.enhanceVoice) {
    filters.push(
      'equalizer=f=180:t=q:w=1:g=-3',
      'equalizer=f=3000:t=q:w=1:g=4',
      'acompressor=threshold=-18dB:ratio=3:attack=5:release=120'
    )
  }

  switch (fx.voiceEffect) {
    case 'chipmunk':
      filters.push('asetrate=62400', 'aresample=48000', 'atempo=0.77')
      break
    case 'robot':
      filters.push('vibrato=f=30:d=0.5', 'aecho=0.8:0.7:20:0.3')
      break
    case 'telephone':
      filters.push(
        'highpass=f=300',
        'lowpass=f=3400',
        'acompressor=threshold=-18dB:ratio=4:attack=5:release=80'
      )
      break
    default:
      break
  }

  if (fx.loudness) {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11', 'aresample=48000')
  }

  return filters
}
