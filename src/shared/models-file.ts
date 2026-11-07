import type { Capability, ParamDef, ProviderType } from './provider-schema'
import type { HttpTemplate } from './http-template'

export interface ModelsFileModel {
  id: string
  preset?: string
  name?: string
  capability?: Capability
  remoteModel?: string
  adapter?: string
  providerType?: ProviderType
  template?: HttpTemplate
  params?: ParamDef[]
}

export interface ModelsFileProvider {
  id: string
  name: string
  type?: ProviderType
  adapter?: string
  baseUrl: string
  /** 附加到该供应商所有请求的自定义请求头；值支持 ${ENV_NAME} */
  headers?: Record<string, string>
  apiKeyEnv?: string
  /** 仅用于读取旧文件；应用会忽略明文 Key 并给出警告 */
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
  warnings: string[]
  providerCount: number
  modelCount: number
}
