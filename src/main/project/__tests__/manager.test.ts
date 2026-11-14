import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/tmp' },
  nativeImage: { createFromBuffer: () => ({}) }
}))

vi.mock('../settings/preferences', () => ({
  getPreferences: async () => ({ project: { defaultDir: '' } })
}))

import { getCurrentProjectRoot, projectNameFromPath, setCurrentProjectRoot } from '../manager'

describe('project manager', () => {
  it('derives the project name from a .cinelab path', () => {
    expect(projectNameFromPath('C:/work/Demo.cinelab')).toBe('Demo')
    expect(projectNameFromPath('/home/user/Demo.cinelab')).toBe('Demo')
    expect(projectNameFromPath('C:/work/My.Project.cinelab')).toBe('My.Project')
  })

  it('keeps names without the project extension', () => {
    expect(projectNameFromPath('C:/work/Demo')).toBe('Demo')
  })

  it('tracks the current project root', () => {
    setCurrentProjectRoot('C:/work/Demo.cinelab')
    expect(getCurrentProjectRoot()).toBe('C:/work/Demo.cinelab')
    setCurrentProjectRoot(null)
    expect(getCurrentProjectRoot()).toBeNull()
  })
})
