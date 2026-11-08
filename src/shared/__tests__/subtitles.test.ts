import { describe, expect, it } from 'vitest'
import { parseSubtitle } from '../subtitles'

describe('parseSubtitle', () => {
  it('parses SRT cues', () => {
    const cues = parseSubtitle(
      [
        '1',
        '00:00:01,000 --> 00:00:04,500',
        '第一句',
        '',
        '2',
        '00:00:05,000 --> 00:00:07,250',
        '第二句',
        '换行文本'
      ].join('\n')
    )

    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({ startMs: 1000, endMs: 4500, text: '第一句' })
    expect(cues[1]).toEqual({
      startMs: 5000,
      endMs: 7250,
      text: '第二句 换行文本'
    })
  })

  it('parses VTT with header and cue settings', () => {
    const cues = parseSubtitle(
      [
        'WEBVTT',
        '',
        '00:00:00.500 --> 00:00:02.000 align:start position:0%',
        '<i>你好</i>'
      ].join('\r\n')
    )

    expect(cues).toEqual([{ startMs: 500, endMs: 2000, text: '你好' }])
  })

  it('supports MM:SS timestamps and skips malformed blocks', () => {
    const cues = parseSubtitle(
      ['01:02.000 --> 01:03.500', '短格式', '', 'not a cue'].join('\n')
    )
    expect(cues).toEqual([{ startMs: 62_000, endMs: 63_500, text: '短格式' }])
  })

  it('ignores empty text and sorts by start time', () => {
    const cues = parseSubtitle(
      [
        '00:00:05,000 --> 00:00:06,000',
        '后',
        '',
        '00:00:01,000 --> 00:00:02,000',
        '前',
        '',
        '00:00:03,000 --> 00:00:04,000',
        '<b></b>'
      ].join('\n')
    )
    expect(cues.map((cue) => cue.text)).toEqual(['前', '后'])
  })
})
