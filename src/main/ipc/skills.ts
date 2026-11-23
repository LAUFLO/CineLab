import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions
} from 'electron'
import type {
  SkillCloneInput,
  SkillImportInstallInput,
  SkillImportKind,
  SkillOverrideInput,
  SkillScope,
  SkillUploadFolder,
  SkillWriteInput
} from '@shared/skills'
import {
  cloneSkill,
  createSkill,
  deleteSkill,
  ensureScopeDirectory,
  importSkillFiles,
  listSkillAdmin,
  listSkillFiles,
  readSkillFile,
  removeSkillFile,
  saveSkill,
  setSkillOverride,
  skillDirectoryFor,
  skillFileFor
} from '../agent/skills-admin'
import {
  cleanupStaleSkillImports,
  discardSkillImport,
  installSkillImport,
  previewSkillImport
} from '../agent/skills-import'
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

function readFolder(value: unknown): SkillUploadFolder {
  if (value !== 'references' && value !== 'assets') {
    throw new Error('只能上传到 references 或 assets')
  }
  return value
}

function readImportKind(value: unknown): SkillImportKind {
  if (value !== 'folder' && value !== 'zip') {
    throw new Error('导入来源无效')
  }
  return value
}

export function registerSkillsIpc(): void {
  void cleanupStaleSkillImports().catch(() => undefined)

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

  ipcMain.handle(
    'skills:upload-files',
    async (_event, scope: unknown, name: unknown, folder: unknown) => {
      const skillScope = readScope(scope)
      const skillName = readName(name)
      const targetFolder = readFolder(folder)
      await skillDirectoryFor(currentRoot(), skillScope, skillName)
      const picked = await dialog.showOpenDialog({
        title: `上传到 ${targetFolder}`,
        properties: ['openFile', 'multiSelections']
      })
      if (picked.canceled || picked.filePaths.length === 0) return null
      return importSkillFiles(currentRoot(), {
        scope: skillScope,
        name: skillName,
        folder: targetFolder,
        files: picked.filePaths
      })
    }
  )

  ipcMain.handle(
    'skills:remove-file',
    (_event, scope: unknown, name: unknown, path: unknown) => {
      if (typeof path !== 'string' || !path.trim()) {
        throw new Error('缺少文件路径')
      }
      return removeSkillFile(currentRoot(), {
        scope: readScope(scope),
        name: readName(name),
        path
      })
    }
  )

  ipcMain.handle(
    'skills:pick-import',
    async (event, kind: unknown) => {
      const importKind = readImportKind(kind)
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: OpenDialogOptions =
        importKind === 'folder'
          ? {
              title: '选择技能文件夹',
              properties: ['openDirectory']
            }
          : {
              title: '选择技能 ZIP 压缩包',
              properties: ['openFile'],
              filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
            }
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (picked.canceled || picked.filePaths.length === 0) return null
      return previewSkillImport({
        kind: importKind,
        sourcePath: picked.filePaths[0],
        projectRoot: currentRoot()
      })
    }
  )

  ipcMain.handle('skills:install-import', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('导入参数无效')
    const data = input as SkillImportInstallInput
    if (typeof data.token !== 'string' || !data.token.trim()) {
      throw new Error('缺少导入会话')
    }
    if (data.scope !== 'global' && data.scope !== 'project') {
      throw new Error('目标作用域无效')
    }
    if (data.overwrite !== undefined && typeof data.overwrite !== 'boolean') {
      throw new Error('覆盖参数无效')
    }
    return installSkillImport({
      projectRoot: currentRoot(),
      data: {
        token: data.token.trim(),
        scope: data.scope,
        ...(data.overwrite !== undefined ? { overwrite: data.overwrite } : {})
      }
    })
  })

  ipcMain.handle('skills:discard-import', (_event, token: unknown) => {
    if (typeof token !== 'string' || !token.trim()) return
    return discardSkillImport(token.trim())
  })

  ipcMain.handle('skills:clone', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('覆盖参数无效')
    const clone = input as SkillCloneInput
    if (clone.targetScope !== 'global' && clone.targetScope !== 'project') {
      throw new Error('目标作用域无效')
    }
    return cloneSkill(currentRoot(), {
      sourceScope: readScope(clone.sourceScope),
      sourceName: readName(clone.sourceName),
      targetScope: clone.targetScope
    })
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
