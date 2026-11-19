import type {
  DefaultResourceLoader,
  ExtensionFactory,
  SettingsManager
} from '@earendil-works/pi-coding-agent'
import { loadPiCodingAgent } from './loader'

export interface PiResourceInput {
  root: string
  agentDir: string
  systemPrompt: string
  settingsManager: SettingsManager
  extensionFactories: ExtensionFactory[]
  noExtensions?: boolean
}

export async function createPiResourceLoader(
  input: PiResourceInput
): Promise<DefaultResourceLoader> {
  const { DefaultResourceLoader: Loader } = await loadPiCodingAgent()
  const loader = new Loader({
    cwd: input.root,
    agentDir: input.agentDir,
    settingsManager: input.settingsManager,
    // 需要加载内联 extension 来挂 tool_call 权限/确认钩子；压缩等无工具场景可关闭
    noExtensions: input.noExtensions ?? false,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: '',
    systemPromptOverride: () => input.systemPrompt,
    appendSystemPrompt: [],
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    extensionFactories: input.extensionFactories
  })
  await loader.reload()
  return loader
}
