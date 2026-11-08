import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_FX, audioFxFilters } from '../audio-fx'

describe('audioFxFilters', () => {
  it('returns nothing when no effects are enabled', () => {
    expect(audioFxFilters(undefined)).toEqual([])
    expect(audioFxFilters(DEFAULT_AUDIO_FX)).toEqual([])
  })

  it('adds denoise', () => {
    expect(audioFxFilters({ ...DEFAULT_AUDIO_FX, denoise: true })).toEqual([
      'afftdn=nf=-25'
    ])
  })

  it('adds voice enhancement as an equalizer and compressor chain', () => {
    const filters = audioFxFilters({
      ...DEFAULT_AUDIO_FX,
      enhanceVoice: true
    })
    expect(filters[0]).toContain('equalizer')
    expect(filters.at(-1)).toContain('acompressor')
  })

  it('adds voice effects', () => {
    expect(
      audioFxFilters({ ...DEFAULT_AUDIO_FX, voiceEffect: 'chipmunk' })
    ).toContain('asetrate=62400')
    expect(
      audioFxFilters({ ...DEFAULT_AUDIO_FX, voiceEffect: 'telephone' })
    ).toContain('highpass=f=300')
    expect(
      audioFxFilters({ ...DEFAULT_AUDIO_FX, voiceEffect: 'robot' })
    ).toContain('vibrato=f=30:d=0.5')
  })

  it('puts loudness normalization last and keeps a 48k sample rate', () => {
    const filters = audioFxFilters({
      ...DEFAULT_AUDIO_FX,
      denoise: true,
      loudness: true
    })
    expect(filters[0]).toBe('afftdn=nf=-25')
    expect(filters.at(-2)).toContain('loudnorm')
    expect(filters.at(-1)).toBe('aresample=48000')
  })
})
