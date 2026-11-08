import { describe, expect, it } from 'vitest'
import { transitionState } from '../timeline-transition'

describe('transitionState', () => {
  it('returns null without transition or after duration', () => {
    expect(transitionState(undefined, 0)).toBeNull()
    expect(
      transitionState({ type: 'fade', durationMs: 1000 }, 1000)
    ).toBeNull()
    expect(
      transitionState({ type: 'fade', durationMs: 0 }, 0)
    ).toBeNull()
  })

  it('crossfades for fade', () => {
    expect(
      transitionState({ type: 'fade', durationMs: 1000 }, 0)
    ).toMatchObject({ incomingAlpha: 0, outgoingAlpha: 1, blackAlpha: 0 })
    expect(
      transitionState({ type: 'fade', durationMs: 1000 }, 500)
    ).toMatchObject({ incomingAlpha: 0.5, outgoingAlpha: 0.5, blackAlpha: 0 })
    expect(
      transitionState({ type: 'fade', durationMs: 1000 }, 750)
    ).toMatchObject({ incomingAlpha: 0.75, outgoingAlpha: 0.25, blackAlpha: 0 })
  })

  it('fades through black for dip-black', () => {
    expect(
      transitionState({ type: 'dip-black', durationMs: 1000 }, 0)
    ).toMatchObject({ incomingAlpha: 0, outgoingAlpha: 1, blackAlpha: 0 })
    expect(
      transitionState({ type: 'dip-black', durationMs: 1000 }, 500)
    ).toMatchObject({ incomingAlpha: 0, outgoingAlpha: 0, blackAlpha: 1 })
    expect(
      transitionState({ type: 'dip-black', durationMs: 1000 }, 1000)
    ).toBeNull()
    expect(
      transitionState({ type: 'dip-black', durationMs: 1000 }, 750)
    ).toMatchObject({ incomingAlpha: 0.5, outgoingAlpha: 0, blackAlpha: 0.5 })
  })

  it('keeps both clips opaque for wipes and slides', () => {
    expect(
      transitionState({ type: 'wipe-left', durationMs: 1000 }, 500)
    ).toMatchObject({
      type: 'wipe-left',
      progress: 0.5,
      incomingAlpha: 1,
      outgoingAlpha: 1,
      blackAlpha: 0
    })
    expect(
      transitionState({ type: 'slide-right', durationMs: 1000 }, 250)
    ).toMatchObject({
      type: 'slide-right',
      progress: 0.25,
      incomingAlpha: 1,
      outgoingAlpha: 1
    })
  })

  it('fades and scales for zoom-in', () => {
    expect(
      transitionState({ type: 'zoom-in', durationMs: 1000 }, 250)
    ).toMatchObject({
      type: 'zoom-in',
      progress: 0.25,
      incomingAlpha: 0.25,
      outgoingAlpha: 0.75
    })
  })
})
