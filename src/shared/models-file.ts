import type {
  Capability,
  ConfigSource,
  MediaInput,
  ModelFeature,
  ParamDef,
  ProviderType
} from './provider-schema'
import type { ModelModeConfig, ModelModeId } from './model-modes'
import type { HttpTemplate } from './http-template'
import type { VideoOperationId } from './operation-schema'

export interface ModelsFileModel {
  id: string
  preset?: string
  name?: string
  capability?: Capability
  remoteModel?: string
  inputs?: MediaInput[]
  operations?: VideoOperationId[]
  /** v2 能力模式；可以是模式 ID 或带槽位覆盖的对象 */
  modes?: Array<ModelModeId | ModelModeConfig>
  features?: ModelFeature[]
  family?: string
  protocol?: string
  source?: ConfigSource
  adapter?: string
  /** 本地适配器 ID；adapter 为 local:<id> 时由本地宿主执行 */
  localAdapter?: string
  providerType?: ProviderType
  template?: HttpTemplate
  extraBody?: Record<string, unknown>
  omitBody?: string[]
  params?: ParamDef[]
}

export interface ModelsFileProvider {
  id: string
  name: string
  type?: ProviderType
  adapter?: string
  /** 默认协议模板 ID */
  protocol?: string
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
