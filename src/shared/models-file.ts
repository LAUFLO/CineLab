import type { Capability, ParamDef, ProviderType } from './provider-schema'
import type { HttpTemplate } from './http-template'

export interface ModelsFileModel {
  id: string
  preset?: string
  name?: string
  capability?: Capability
  remoteModel?: string
  adapter?: string
  template?: HttpTemplate
  params?: ParamDef[]
}

export interface ModelsFileProvider {
  id: string
  name: string
  type?: ProviderType
  adapter?: string
  baseUrl: string
  apiKeyEnv?: string
  apiKey?: string
  models: ModelsFileModel[]
}

export interface ModelsFile {
  version: number
  providers: ModelsFileProvider[]
}

export interface ModelsConfigStatus {
  files: string[]
  activeFile: string | null
  errors: string[]
  providerCount: number
  modelCount: number
}
