import { ipcMain, shell } from 'electron'
import type {
  SkillOverrideInput,
  SkillScope,
  SkillWriteInput
} from '@shared/skills'
import {
  createSkill,
  deleteSkill,
  ensureScopeDirectory,
  listSkillAdmin,
  listSkillFiles,
  readSkillFile,
  saveSkill,
  setSkillOverride,
  skillDirectoryFor,
  skillFileFor
} from '../agent/skills-admin'
import { getCurrentProjectRoot } from '../project/manager'

const SCOPES: SkillScope[] = ['builtin', 'global', 'project']

function currentRoot(): string {
  return getCurrentProjectRoot() ?? ''
}

function readScope(value: unknown): SkillScope {
  if (typeof value !== 'string' || !SCOPES.includes(value as SkillScope)) {
    throw new Error('技能作用域无效')
  }
  return value as SkillScope
}

function readName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('缺少技能名称')
  }
  return value.trim()
}

export function registerSkillsIpc(): void {
  ipcMain.handle('skills:list', () => listSkillAdmin(currentRoot()))

  ipcMain.handle('skills:files', (_event, scope: unknown, name: unknown) => {
    return listSkillFiles(currentRoot(), {
      scope: readScope(scope),
      name: readName(name)
    })
  })

  ipcMain.handle(
    'skills:read-file',
    (_event, scope: unknown, name: unknown, path: unknown) => {
      return readSkillFile(currentRoot(), {
        scope: readScope(scope),
        name: readName(name),
        ...(typeof path === 'string' ? { path } : {})
      })
    }
  )

  ipcMain.handle('skills:create', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('技能数据无效')
    return createSkill(currentRoot(), input as SkillWriteInput)
  })

  ipcMain.handle('skills:save', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('技能数据无效')
    return saveSkill(currentRoot(), input as SkillWriteInput)
  })

  ipcMain.handle('skills:remove', (_event, scope: unknown, name: unknown) => {
    return deleteSkill(currentRoot(), readScope(scope), readName(name))
  })

  ipcMain.handle('skills:set-override', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('技能状态无效')
    return setSkillOverride(currentRoot(), input as SkillOverrideInput)
  })

  ipcMain.handle(
    'skills:open-directory',
    async (_event, scope: unknown, name: unknown) => {
      const skillScope = readScope(scope)
      const directory =
        typeof name === 'string' && name.trim()
          ? await skillDirectoryFor(currentRoot(), skillScope, name.trim())
          : await ensureScopeDirectory(currentRoot(), skillScope)
      const error = await shell.openPath(directory)
      if (error) throw new Error(error)
    }
  )

  ipcMain.handle(
    'skills:open-file',
    async (_event, scope: unknown, name: unknown, path: unknown) => {
      if (typeof path !== 'string') throw new Error('缺少文件路径')
      const file = await skillFileFor(currentRoot(), {
        scope: readScope(scope),
        name: readName(name),
        path
      })
      const error = await shell.openPath(file)
      if (error) throw new Error(error)
    }
  )
}
