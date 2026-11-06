import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const file = process.argv[2] ?? 'models.json'

if (!existsSync(file)) {
  console.log(`[models:check] 未找到 ${file}，跳过`)
  process.exit(0)
}

const CAPABILITIES = [
  'image.t2i',
  'image.i2i',
  'text.chat',
  'video.t2v',
  'audio.tts',
  'audio.music'
]
const PROVIDER_TYPES = ['openai-compat', 'kling']
const ADAPTERS = [
  'openai-compat',
  'agnes-video',
  'volcengine-video',
  'http-template',
  'minimax-video',
  'minimax-legacy',
  'kling-video'
]
const PARAM_TYPES = ['select', 'number', 'text', 'boolean']

const errors = []
const warnings = []

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function checkParam(param, path) {
  if (!isRecord(param)) {
    errors.push(`${path} 必须是对象`)
    return
  }

  const key = readString(param.key)
  const label = readString(param.label)
  const type = readString(param.type)

  if (!key) errors.push(`${path}.key 不能为空`)
  if (!label) errors.push(`${path}.label 不能为空`)
  if (!type || !PARAM_TYPES.includes(type)) {
    errors.push(`${path}.type 必须是 ${PARAM_TYPES.join(' / ')}`)
  }

  if (type === 'select') {
    if (!Array.isArray(param.options) || param.options.length === 0) {
      errors.push(`${path}.options 不能为空`)
      return
    }
    param.options.forEach((option, index) => {
      if (!isRecord(option)) {
        errors.push(`${path}.options[${index}] 必须是对象`)
        return
      }
      if (!readString(option.value)) {
        errors.push(`${path}.options[${index}].value 不能为空`)
      }
      if (!readString(option.label)) {
        errors.push(`${path}.options[${index}].label 不能为空`)
      }
    })
  }
}

function checkModel(model, path) {
  if (!isRecord(model)) {
    errors.push(`${path} 必须是对象`)
    return
  }

  const id = readString(model.id)
  if (!id) {
    errors.push(`${path}.id 不能为空`)
    return
  }

  const preset = readString(model.preset)
  if (!preset) {
    if (!readString(model.name)) errors.push(`${path}.name 不能为空`)
    if (!readString(model.remoteModel)) {
      errors.push(`${path}.remoteModel 不能为空`)
    }
    const capability = readString(model.capability)
    if (!capability || !CAPABILITIES.includes(capability)) {
      errors.push(`${path}.capability 必须是 ${CAPABILITIES.join(' / ')}`)
    }
  }

  const adapter = readString(model.adapter)
  if (adapter && !ADAPTERS.includes(adapter)) {
    errors.push(`${path}.adapter 不支持：${adapter}`)
  }

  const providerType = readString(model.providerType)
  if (providerType && !PROVIDER_TYPES.includes(providerType)) {
    errors.push(`${path}.providerType 必须是 ${PROVIDER_TYPES.join(' / ')}`)
  }

  if (model.params !== undefined) {
    if (!Array.isArray(model.params)) {
      errors.push(`${path}.params 必须是数组`)
    } else {
      model.params.forEach((param, index) =>
        checkParam(param, `${path}.params[${index}]`)
      )
    }
  }
}

let data
try {
  data = JSON.parse(await readFile(file, 'utf8'))
} catch (error) {
  console.error(`[models:check] ${file} JSON 解析失败：${String(error)}`)
  process.exit(1)
}

if (!isRecord(data)) {
  errors.push('根节点必须是对象')
} else {
  if (Number(data.version ?? 1) !== 1) {
    errors.push('version 只支持 1')
  }

  if (!Array.isArray(data.providers)) {
    errors.push('providers 必须是数组')
  } else {
    const providerIds = new Set()

    data.providers.forEach((provider, providerIndex) => {
      const path = `providers[${providerIndex}]`
      if (!isRecord(provider)) {
        errors.push(`${path} 必须是对象`)
        return
      }

      const id = readString(provider.id)
      if (!id) errors.push(`${path}.id 不能为空`)
      if (id && providerIds.has(id)) errors.push(`${path}.id 重复：${id}`)
      if (id) providerIds.add(id)
      if (!readString(provider.name)) errors.push(`${path}.name 不能为空`)
      if (!readString(provider.baseUrl)) errors.push(`${path}.baseUrl 不能为空`)

      const type = readString(provider.type)
      if (type && !PROVIDER_TYPES.includes(type)) {
        errors.push(`${path}.type 必须是 ${PROVIDER_TYPES.join(' / ')}`)
      }

      const adapter = readString(provider.adapter)
      if (adapter && !ADAPTERS.includes(adapter)) {
        errors.push(`${path}.adapter 不支持：${adapter}`)
      }

      if (readString(provider.apiKey)) {
        warnings.push(
          `${path}.apiKey 是明文 Key，应用会忽略；请改用设置页或 apiKeyEnv`
        )
      }

      if (!Array.isArray(provider.models) || provider.models.length === 0) {
        errors.push(`${path}.models 不能为空`)
        return
      }

      const modelIds = new Set()
      provider.models.forEach((model, modelIndex) => {
        const modelPath = `${path}.models[${modelIndex}]`
        checkModel(model, modelPath)
        if (isRecord(model)) {
          const modelId = readString(model.id)
          if (modelId && modelIds.has(modelId)) {
            errors.push(`${modelPath}.id 重复：${modelId}`)
          }
          if (modelId) modelIds.add(modelId)
        }
      })
    })
  }
}

if (errors.length > 0) {
  console.error(`[models:check] ${file} 校验失败：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

if (warnings.length > 0) {
  console.warn(`[models:check] ${file} 警告：`)
  for (const warning of warnings) console.warn(`- ${warning}`)
}

const providers = data.providers.length
const models = data.providers.reduce(
  (total, provider) => total + provider.models.length,
  0
)
console.log(`[models:check] ${file} 格式正确：${providers} 个供应商，${models} 个模型`)
