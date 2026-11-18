import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MIRRORS,
  installerFallback,
  installerFor,
  mirrorPrefixes,
  probeMirror,
  releasesFallback,
  resolveInstallerFallback
} from '../fallback'

const installer = {
  fileName: 'CineLab-0.2.2-x64.exe',
  githubUrl:
    'https://github.com/LAUFLO/CineLab/releases/download/v0.2.2/CineLab-0.2.2-x64.exe'
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('installerFor', () => {
  it('相对文件名拼成 GitHub Releases 地址', () => {
    expect(
      installerFor({
        version: '0.2.2',
        files: [{ url: 'CineLab-0.2.2-x64.exe' }]
      })
    ).toEqual({
      fileName: 'CineLab-0.2.2-x64.exe',
      githubUrl:
        'https://github.com/LAUFLO/CineLab/releases/download/v0.2.2/CineLab-0.2.2-x64.exe'
    })
  })

  it('绝对地址原样保留', () => {
    const url = 'https://example.com/installer.exe'
    expect(installerFor({ version: '1.0.0', files: [{ url }] })).toEqual({
      fileName: 'installer.exe',
      githubUrl: url
    })
  })

  it('缺少文件信息时返回 null', () => {
    expect(installerFor({ version: '1.0.0' })).toBeNull()
    expect(installerFor({ version: '1.0.0', files: [{}] })).toBeNull()
  })
})

describe('mirrorPrefixes', () => {
  it('默认使用内置列表', () => {
    expect(mirrorPrefixes({})).toEqual(DEFAULT_MIRRORS)
  })

  it('支持逗号分隔覆盖并去掉尾部斜杠', () => {
    expect(
      mirrorPrefixes({
        CINELAB_UPDATE_MIRRORS: ' https://a.test/ , https://b.test '
      })
    ).toEqual(['https://a.test', 'https://b.test'])
  })

  it('覆盖内容为空时回退内置列表', () => {
    expect(mirrorPrefixes({ CINELAB_UPDATE_MIRRORS: ' , ' })).toEqual(
      DEFAULT_MIRRORS
    )
  })
})

describe('probeMirror', () => {
  it('HEAD 成功即视为可用', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await probeMirror('https://mirror.test/latest.yml')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('HEAD 失败时用 Range GET 兜底', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await probeMirror('https://mirror.test/latest.yml')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { Range: 'bytes=0-0' }
    })
  })

  it('请求抛错时返回 false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))

    expect(await probeMirror('https://mirror.test/latest.yml')).toBe(false)
  })
})

describe('resolveInstallerFallback', () => {
  it('使用可用的镜像并记录来源域名', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    )

    expect(
      await resolveInstallerFallback(installer, ['https://gh-proxy.com'])
    ).toEqual({
      kind: 'installer',
      url: `https://gh-proxy.com/${installer.githubUrl}`,
      source: 'gh-proxy.com',
      fileName: installer.fileName
    })
  })

  it('全部镜像失败时回退 GitHub 原始链接', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))

    expect(
      await resolveInstallerFallback(installer, ['https://a.test', 'https://b.test'])
    ).toEqual(installerFallback(installer))
  })

  it('多个镜像可用时采用最快返回的那个', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).startsWith('https://slow.test')) {
          await new Promise((resolve) => setTimeout(resolve, 40))
        }
        return new Response(null, { status: 200 })
      })
    )

    const fallback = await resolveInstallerFallback(installer, [
      'https://slow.test',
      'https://fast.test'
    ])

    expect(fallback.source).toBe('fast.test')
    expect(fallback.url).toBe(`https://fast.test/${installer.githubUrl}`)
  })
})

describe('fallback 构造', () => {
  it('发布页固定指向 latest', () => {
    expect(releasesFallback()).toEqual({
      kind: 'releases-page',
      url: 'https://github.com/LAUFLO/CineLab/releases/latest',
      source: 'github'
    })
  })

  it('安装包兜底带文件名', () => {
    expect(installerFallback(installer)).toEqual({
      kind: 'installer',
      url: installer.githubUrl,
      source: 'github',
      fileName: 'CineLab-0.2.2-x64.exe'
    })
  })
})
