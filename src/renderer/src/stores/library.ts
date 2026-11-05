import { create } from 'zustand'
import type { AssetScope } from '@shared/asset-schema'
import type {
  CharacterCard,
  LibraryAsset,
  LibraryFolderNode,
  PromptTemplate,
  TemplateInput
} from '@shared/library-schema'
import { PROMPT_FOLDER } from '@shared/library-schema'

export interface PendingAdd {
  sourcePath: string
  scope: AssetScope
  name: string
}

interface LibraryState {
  panelOpen: boolean
  mode: 'browse' | 'pick'
  root: string
  isDefault: boolean
  tree: LibraryFolderNode[]
  folder: string
  assets: LibraryAsset[]
  allAssets: LibraryAsset[]
  characters: CharacterCard[]
  templates: PromptTemplate[]
  loading: boolean
  error: string | null
  pendingAdds: PendingAdd[]

  openPanel: (folder?: string) => void
  openPicker: (pending: PendingAdd | PendingAdd[]) => void
  closePanel: () => void
  setFolder: (folder: string) => Promise<void>
  refresh: () => Promise<void>
  loadCharacters: () => Promise<void>
  loadTemplates: () => Promise<void>
  createFolder: (parent: string, name: string) => Promise<LibraryFolderNode | null>
  renameFolder: (path: string, name: string) => Promise<void>
  deleteFolder: (path: string) => Promise<void>
  importAssets: () => Promise<LibraryAsset[]>
  confirmAdd: (folder: string) => Promise<LibraryAsset[]>
  renameAsset: (path: string, name: string) => Promise<void>
  deleteAsset: (path: string) => Promise<void>
  reveal: (path: string) => Promise<void>
  saveTemplate: (input: TemplateInput) => Promise<boolean>
  deleteTemplate: (id: string) => Promise<void>
  chooseRoot: () => Promise<void>
  resetRoot: () => Promise<void>
  revealRoot: () => Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  const loadRoot = async (): Promise<void> => {
    const info = await window.api.library.root()
    set({ root: info.root, isDefault: info.isDefault })
  }

  const loadTree = async (): Promise<void> => {
    const tree = await window.api.library.tree()
    set({ tree })
  }

  const loadFolder = async (folder: string): Promise<void> => {
    const assets = await window.api.library.listAssets(folder)
    set({ folder, assets })
  }

  const loadCharacters = async (): Promise<void> => {
    const characters = await window.api.library.listCharacters()
    set({ characters })
  }

  const loadTemplates = async (): Promise<void> => {
    const templates = await window.api.library.listTemplates()
    set({ templates })
  }

  return {
    panelOpen: false,
    mode: 'browse',
    root: '',
    isDefault: true,
    tree: [],
    folder: '',
    assets: [],
    allAssets: [],
    characters: [],
    templates: [],
    loading: false,
    error: null,
    pendingAdds: [],

    openPanel: (folder) => {
      const target = folder ?? get().folder
      set({ panelOpen: true, mode: 'browse', pendingAdds: [], error: null })
      void get()
        .refresh()
        .then(() => get().setFolder(target))
    },

    openPicker: (pending) => {
      const pendingAdds = Array.isArray(pending) ? pending : [pending]
      set({
        panelOpen: true,
        mode: 'pick',
        pendingAdds,
        folder: '',
        error: null
      })
      void get().refresh()
    },

    closePanel: () => set({ panelOpen: false, pendingAdds: [], error: null }),

    setFolder: async (folder) => {
      set({ loading: true })
      try {
        await loadFolder(folder)
        set({ loading: false, error: null })
      } catch (error) {
        set({ loading: false, error: messageOf(error) })
      }
    },

    refresh: async () => {
      set({ loading: true })
      try {
        const [rootInfo, tree, assets, allAssets, characters, templates] =
          await Promise.all([
            window.api.library.root(),
            window.api.library.tree(),
            window.api.library.listAssets(get().folder),
            window.api.library.listAllAssets(),
            window.api.library.listCharacters(),
            window.api.library.listTemplates()
          ])

        set({
          root: rootInfo.root,
          isDefault: rootInfo.isDefault,
          tree,
          assets,
          allAssets,
          characters,
          templates,
          loading: false,
          error: null
        })
      } catch (error) {
        set({ loading: false, error: messageOf(error) })
      }
    },

    loadCharacters,
    loadTemplates,

    createFolder: async (parent, name) => {
      try {
        const node = await window.api.library.createFolder(parent, name)
        await loadTree()
        set({ error: null })
        return node
      } catch (error) {
        set({ error: messageOf(error) })
        return null
      }
    },

    renameFolder: async (path, name) => {
      try {
        const next = await window.api.library.renameFolder(path, name)
        const current = get().folder
        const folder =
          current === path
            ? next
            : current.startsWith(`${path}/`)
              ? `${next}${current.slice(path.length)}`
              : current

        await loadTree()
        if (folder !== current) await loadFolder(folder)
        set({ error: null })
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    deleteFolder: async (path) => {
      try {
        await window.api.library.deleteFolder(path)
        const current = get().folder
        const parent = path.split('/').slice(0, -1).join('/')
        const folder =
          current === path || current.startsWith(`${path}/`) ? parent : current

        await loadTree()
        if (folder !== current) await loadFolder(folder)
        set({ error: null })
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    importAssets: async () => {
      try {
        const imported = await window.api.library.importAssets(get().folder)
        if (imported.length > 0) {
          await Promise.all([loadFolder(get().folder), loadTree()])
        }
        set({ error: null })
        return imported
      } catch (error) {
        set({ error: messageOf(error) })
        return []
      }
    },

    confirmAdd: async (folder) => {
      const pending = get().pendingAdds
      if (pending.length === 0) return []

      try {
        const saved = await window.api.library.saveAssets(
          pending.map((item) => ({
            path: item.sourcePath,
            scope: item.scope,
            name: item.name
          })),
          folder
        )

        await Promise.all([loadTree(), loadCharacters()])
        if (get().folder === folder) await loadFolder(folder)
        set({ error: null, pendingAdds: [], panelOpen: false })
        return saved
      } catch (error) {
        set({ error: messageOf(error) })
        return []
      }
    },

    renameAsset: async (path, name) => {
      try {
        await window.api.library.renameAsset(path, name)
        await loadFolder(get().folder)
        set({ error: null })
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    deleteAsset: async (path) => {
      try {
        await window.api.library.deleteAsset(path)
        await Promise.all([
          loadFolder(get().folder),
          loadTree(),
          loadCharacters()
        ])
        set({ error: null })
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    reveal: async (path) => {
      try {
        await window.api.library.reveal(path)
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    saveTemplate: async (input) => {
      try {
        await window.api.library.saveTemplate(input)
        await loadTemplates()
        set({ error: null })
        return true
      } catch (error) {
        set({ error: messageOf(error) })
        return false
      }
    },

    deleteTemplate: async (id) => {
      try {
        await window.api.library.deleteTemplate(id)
        await loadTemplates()
        set({ error: null })
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    chooseRoot: async () => {
      try {
        const info = await window.api.library.chooseRoot()
        if (!info) return

        set({ root: info.root, isDefault: info.isDefault })
        await get().refresh()
        await get().setFolder('')
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    resetRoot: async () => {
      try {
        const info = await window.api.library.resetRoot()
        set({ root: info.root, isDefault: info.isDefault })
        await get().refresh()
        await get().setFolder('')
      } catch (error) {
        set({ error: messageOf(error) })
      }
    },

    revealRoot: async () => {
      try {
        await window.api.library.revealRoot()
      } catch (error) {
        set({ error: messageOf(error) })
      }
    }
  }
})

export const PROMPT_FOLDER_PATH = PROMPT_FOLDER
