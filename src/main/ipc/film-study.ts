import { ipcMain } from 'electron'
import type { FilmStudyExtractRequest } from '@shared/film-study'
import { getCurrentProjectRoot } from '../project/manager'
import {
  cancelFilmStudy,
  extractFilmStudy,
  loadFilmStudy
} from '../film-study/service'

function requireProjectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('没有打开的项目')
  return root
}

export function registerFilmStudyIpc(): void {
  ipcMain.handle(
    'film-study:extract',
    async (event, input: FilmStudyExtractRequest) => {
      return extractFilmStudy(requireProjectRoot(), input, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('film-study:progress', progress)
        }
      })
    }
  )

  ipcMain.handle('film-study:cancel', (_event, nodeId: string) => {
    cancelFilmStudy(nodeId)
  })

  ipcMain.handle('film-study:load', (_event, studyId: string) =>
    loadFilmStudy(requireProjectRoot(), studyId)
  )
}
