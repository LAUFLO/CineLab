import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * 模型配置 Skill 的源文件。
 *
 * 开发环境从仓库读取；打包后由 electron-builder 的 extraResources
 * 复制到 resources/model-config-skill。
 */
export function modelSkillPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'model-config-skill', 'SKILL.md')
    : join(app.getAppPath(), 'resources', 'model-config-skill', 'SKILL.md')
}

export async function readModelSkill(): Promise<string> {
  return fs.readFile(modelSkillPath(), 'utf8')
}
