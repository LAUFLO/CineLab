import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let userData: string

test.describe.serial('CineLab desktop', () => {
  test.beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'cinelab-e2e-'))
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...(process.env as Record<string, string>),
        CINELAB_USER_DATA: userData,
        CINELAB_DISABLE_THROTTLE: '1'
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await app.close()
    await rm(userData, { recursive: true, force: true })
  })

  test('starts at the project center', async () => {
    await expect(page.getByText('新建项目')).toBeVisible({ timeout: 20_000 })
  })

  test('creates a project and renders the canvas', async () => {
    const parent = join(userData, 'projects')
    await mkdir(parent, { recursive: true })

    await page.evaluate(
      ({ parent }) =>
        (
          window as unknown as {
            api: {
              project: {
                create: (
                  name: string,
                  parentDir: string,
                  templateId: string
                ) => Promise<unknown>
              }
            }
          }
        ).api.project.create('E2E', parent, 'blank'),
      { parent }
    )

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector('.react-flow') ??
            document.querySelector('.project-card')
        ),
      undefined,
      { timeout: 20_000 }
    )

    if ((await page.locator('.react-flow').count()) === 0) {
      await page.locator('.project-card', { hasText: 'E2E' }).first().click()
    }
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: '图片生成' }).click()
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await expect(page.locator('.promptbar')).toBeVisible()
  })

  test('opens the asset library', async () => {
    await page.getByRole('button', { name: '资产管理' }).click()
    await expect(page.locator('.library-window')).toBeVisible()
    await page.locator('.library-window [aria-label="关闭"]').click()
    await expect(page.locator('.library-window')).toHaveCount(0)
  })

  test('opens CineBot', async () => {
    await page.locator('[aria-label="打开 CineBot"]').click()
    await expect(page.locator('.agent-panel')).toBeVisible()
    await expect(page.locator('.agent-panel textarea')).toBeVisible()
  })
})
