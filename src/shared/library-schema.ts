import type { NodeKind } from './canvas-schema'

export interface CharacterCard {
  id: string
  name: string
  description: string
  avatarPath?: string
  referencePaths: string[]
  createdAt: string
  updatedAt: string
}

export interface CharacterInput {
  id?: string
  name: string
  description: string
  referencePaths: string[]
}

export type MaterialKind = 'image' | 'video' | 'audio'

export interface PromptTemplate {
  id: string
  name: string
  kind: NodeKind
  prompt: string
  createdAt: string
  updatedAt: string
}

export interface TemplateInput {
  id?: string
  name: string
  kind: NodeKind
  prompt: string
}

export interface LibraryMaterial {
  id: string
  name: string
  path: string
  kind: MaterialKind
  createdAt: string
}
