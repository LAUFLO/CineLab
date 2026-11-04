import { create } from 'zustand'
import type {
  CharacterCard,
  CharacterInput,
  LibraryMaterial,
  PromptTemplate,
  TemplateInput
} from '@shared/library-schema'

type LibraryTab = 'characters' | 'materials' | 'templates'

interface LibraryState {
  panelOpen: boolean
  tab: LibraryTab
  characters: CharacterCard[]
  materials: LibraryMaterial[]
  templates: PromptTemplate[]
  loading: boolean
  error: string | null

  openPanel: (tab?: LibraryTab) => void
  closePanel: () => void
  setTab: (tab: LibraryTab) => void
  load: () => Promise<void>
  saveCharacter: (input: CharacterInput) => Promise<void>
  deleteCharacter: (id: string) => Promise<void>
  pickCharacterImages: () => Promise<string[]>
  importMaterials: () => Promise<void>
  deleteMaterial: (id: string) => Promise<void>
  saveTemplate: (input: TemplateInput) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  panelOpen: false,
  tab: 'characters',
  characters: [],
  materials: [],
  templates: [],
  loading: false,
  error: null,

  openPanel: (tab) => {
    set({ panelOpen: true, tab: tab ?? get().tab, error: null })
    void get().load()
  },

  closePanel: () => set({ panelOpen: false }),
  setTab: (tab) => set({ tab }),

  load: async () => {
    set({ loading: true })
    try {
      const [characters, materials, templates] = await Promise.all([
        window.api.library.listCharacters(),
        window.api.library.listMaterials(),
        window.api.library.listTemplates()
      ])
      set({ characters, materials, templates, loading: false, error: null })
    } catch (error) {
      set({ loading: false, error: messageOf(error) })
    }
  },

  saveCharacter: async (input) => {
    try {
      const card = await window.api.library.saveCharacter(input)
      const list = get().characters
      const exists = list.some((item) => item.id === card.id)
      set({
        characters: exists
          ? list.map((item) => (item.id === card.id ? card : item))
          : [...list, card],
        error: null
      })
    } catch (error) {
      set({ error: messageOf(error) })
    }
  },

  deleteCharacter: async (id) => {
    await window.api.library.deleteCharacter(id)
    set({ characters: get().characters.filter((item) => item.id !== id) })
  },

  pickCharacterImages: async () => {
    try {
      return await window.api.library.pickCharacterImages()
    } catch (error) {
      set({ error: messageOf(error) })
      return []
    }
  },

  importMaterials: async () => {
    try {
      const imported = await window.api.library.importMaterials()
      if (imported.length === 0) return

      const merged = [...get().materials]
      for (const material of imported) {
        if (!merged.some((item) => item.id === material.id)) {
          merged.push(material)
        }
      }

      set({ materials: merged, error: null })
    } catch (error) {
      set({ error: messageOf(error) })
    }
  },

  deleteMaterial: async (id) => {
    await window.api.library.deleteMaterial(id)
    set({ materials: get().materials.filter((item) => item.id !== id) })
  },

  saveTemplate: async (input) => {
    try {
      const template = await window.api.library.saveTemplate(input)
      const list = get().templates
      const exists = list.some((item) => item.id === template.id)
      set({
        templates: exists
          ? list.map((item) => (item.id === template.id ? template : item))
          : [...list, template],
        error: null
      })
    } catch (error) {
      set({ error: messageOf(error) })
    }
  },

  deleteTemplate: async (id) => {
    await window.api.library.deleteTemplate(id)
    set({ templates: get().templates.filter((item) => item.id !== id) })
  }
}))
