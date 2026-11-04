import { cpSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = 'D:/CineLab'
const dir = join(root, 'release/win-unpacked')
const app = join(dir, 'resources/app')

rmSync(app, { recursive: true, force: true })
mkdirSync(app, { recursive: true })

cpSync(join(root, 'out'), join(app, 'out'), { recursive: true })
mkdirSync(join(app, 'node_modules'), { recursive: true })
cpSync(join(root, 'node_modules/zod'), join(app, 'node_modules/zod'), {
  recursive: true
})

writeFileSync(
  join(app, 'package.json'),
  JSON.stringify(
    {
      name: 'cinelab',
      version: '0.1.0',
      description: 'CineLab — AI 创作无限画布',
      main: 'out/main/index.js'
    },
    null,
    2
  )
)

copyFileSync(join(root, 'node_modules/electron/dist/electron.exe'), join(dir, 'CineLab.exe'))

console.log('assembled:', app)
