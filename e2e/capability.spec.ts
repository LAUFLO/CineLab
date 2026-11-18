import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let userData: string

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64'
)

function silentWav(seconds = 1): Buffer {
  const sampleRate = 8000
  const samples = sampleRate * seconds
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function assetNode(
  id: string,
  kind: 'audio' | 'video' | 'image',
  title: string,
  path: string,
  x: number,
  y: number,
  createdAt: string
): Record<string, unknown> {
  return {
    id,
    type: 'cine',
    position: { x, y },
    data: {
      kind,
      title,
      status: 'done',
      assetOnly: true,
      outputs: [
        {
          id: `${id}-out`,
          path,
          scope: 'project',
          kind,
          createdAt,
          model: '本地上传'
        }
      ],
      selectedOutputId: `${id}-out`,
      templates: []
    }
  }
}

test.describe.serial('capability-driven prompt bar', () => {
  test.beforeAll(async () => {
    userData = mkdtempSync(join(tmpdir(), 'cinelab-e2e-cap-'))
    const root = join(userData, 'projects', 'capability.cinelab')
    const createdAt = new Date().toISOString()
    const canvasId = 'canvas1'

    for (const dir of [
      'assets/aud',
      'assets/vid',
      'assets/img',
      'exports',
      'timelines',
      'stages'
    ]) {
      mkdirSync(join(root, dir), { recursive: true })
    }

    writeFileSync(join(root, 'assets/aud/audio.wav'), silentWav())
    writeFileSync(join(root, 'assets/vid/video.mp4'), Buffer.alloc(0))
    for (let index = 1; index <= 3; index += 1) {
      writeFileSync(
        join(root, `assets/img/img${index}.png`),
        ONE_PIXEL_PNG
      )
    }

    const nodes = [
      assetNode('audio1', 'audio', '参考音频', 'assets/aud/audio.wav', 80, 80, createdAt),
      assetNode('videoRef1', 'video', '参考视频', 'assets/vid/video.mp4', 80, 300, createdAt),
      assetNode('img1', 'image', '图 1', 'assets/img/img1.png', 80, 520, createdAt),
      assetNode('img2', 'image', '图 2', 'assets/img/img2.png', 80, 740, createdAt),
      assetNode('img3', 'image', '图 3', 'assets/img/img3.png', 80, 960, createdAt),
      {
        id: 'video1',
        type: 'cine',
        position: { x: 640, y: 400 },
        data: {
          kind: 'video',
          title: '目标视频',
          status: 'idle',
          templates: []
        }
      }
    ]

    const edges = ['audio1', 'videoRef1', 'img1', 'img2', 'img3'].map(
      (source) => ({
        id: `edge-${source}`,
        source,
        target: 'video1',
        type: 'default'
      })
    )

    writeFileSync(
      join(root, 'project.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'proj-e2e-capability',
          name: 'Capability E2E',
          createdAt,
          updatedAt: createdAt,
          canvases: [
            { id: canvasId, name: '画布 1', file: `canvas-${canvasId}.json` }
          ],
          activeCanvasId: canvasId
        },
        null,
        2
      )
    )
    writeFileSync(
      join(root, `canvas-${canvasId}.json`),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: canvasId,
          name: '画布 1',
          viewport: { x: 0, y: 0, zoom: 0.7 },
          nodes,
          edges
        },
        null,
        2
      )
    )
    writeFileSync(
      join(userData, 'recent-projects.json'),
      JSON.stringify(
        [
          {
            path: root,
            name: 'Capability E2E',
            lastOpenedAt: createdAt
          }
        ],
        null,
        2
      )
    )
    writeFileSync(
      join(userData, 'models.json'),
      JSON.stringify(
        {
          version: 1,
          providers: [
            {
              id: 'agnes',
              name: 'Agnes AI',
              type: 'openai-compat',
              baseUrl: 'https://api.agnes-ai.cn/v1',
              apiKeyEnv: 'AGNES_API_KEY',
              models: [
                {
                  id: 'agnes-video-2.5-flash',
                  name: 'Agnes Video 2.5 Flash',
                  capability: 'video.t2v',
                  remoteModel: 'agnes-video-2.5-flash',
                  inputs: ['text', 'image', 'audio'],
                  operations: [],
                  modes: [
                    { id: 't2v' },
                    { id: 'first-frame' },
                    { id: 'first-last' },
                    { id: 'reference' }
                  ],
                  features: ['audio'],
                  params: [
                    {
                      key: 'duration',
                      label: '时长',
                      type: 'number',
                      defaultValue: 5,
                      min: 4,
                      max: 12
                    },
                    {
                      key: 'ratio',
                      label: '比例',
                      type: 'select',
                      defaultValue: '16:9',
                      options: [{ value: '16:9', label: '16:9' }]
                    }
                  ],
                  adapter: 'agnes-video'
                },
                {
                  id: 'agnes-video-2.5',
                  name: 'Agnes Video 2.5',
                  capability: 'video.t2v',
                  remoteModel: 'agnes-video-2.5',
                  inputs: ['text', 'image', 'video', 'audio'],
                  operations: [],
                  modes: [
                    { id: 't2v' },
                    { id: 'first-frame' },
                    { id: 'first-last' },
                    { id: 'reference' }
                  ],
                  features: ['audio'],
                  params: [
                    {
                      key: 'duration',
                      label: '时长',
                      type: 'number',
                      defaultValue: 5,
                      min: 4,
                      max: 12
                    },
                    {
                      key: 'ratio',
                      label: '比例',
                      type: 'select',
                      defaultValue: '16:9',
                      options: [{ value: '16:9', label: '16:9' }]
                    }
                  ],
                  adapter: 'agnes-video'
                }
              ]
            }
          ]
        },
        null,
        2
      )
    )

    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...(process.env as Record<string, string>),
        CINELAB_USER_DATA: userData,
        CINELAB_DISABLE_THROTTLE: '1',
        CINELAB_DEBUG_PORT: '0'
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('[data-id=video1]').waitFor({ timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  })

  test('shows only the media supported by the model', async () => {
    await page.locator('[data-id=video1]').click()

    const mode = page.locator('button[aria-haspopup=listbox]')
    if ((await mode.innerText()).trim() !== '全能参考') {
      await mode.click()
      await page.locator('[role=option]').filter({ hasText: '全能参考' }).click()
    }

    const slots = page.locator('[data-testid=promptbar-slots]')
    await expect(slots.locator('[data-slot-kind=image]')).toHaveCount(3)
    await expect(slots.locator('[data-slot-kind=audio]')).toHaveCount(1)
    await expect(slots.locator('[data-slot-kind=video]')).toHaveCount(0)
    await expect(page.getByText('不支持视频')).toBeVisible()

    await page
      .locator('button')
      .filter({ hasText: 'Agnes Video 2.5 Flash' })
      .first()
      .click()
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('[role=menuitem]')]
      const target = items.find(
        (item) =>
          item.textContent?.includes('Agnes Video 2.5') &&
          !item.textContent.includes('Flash')
      )
      ;(target as HTMLElement | undefined)?.click()
    })

    await expect(slots.locator('[data-slot-kind=video]')).toHaveCount(1)

    const modelChip = page
      .locator('button')
      .filter({ hasText: 'Agnes Video 2.5' })
      .filter({ hasNotText: 'Flash' })
      .first()
    await expect(modelChip).not.toContainText('不支持视频')
  })
})
