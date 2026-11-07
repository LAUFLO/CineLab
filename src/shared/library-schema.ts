import type { NodeKind } from './canvas-schema'

export type LibraryAssetKind = 'image' | 'video' | 'audio' | 'template'

export interface LibraryAsset {
  /** 相对全局库根的路径（使用 / 分隔），同时作为稳定 id */
  path: string
  /** 不含扩展名的显示名 */
  name: string
  /** 含扩展名的文件名 */
  fileName: string
  kind: LibraryAssetKind
  size: number
  modifiedAt: string
  /** 用户标签，存储在库根 .tags.json */
  tags?: string[]
}

export interface LibraryFolderNode {
  /** 相对库根的路径，根目录为空字符串 */
  path: string
  name: string
  children: LibraryFolderNode[]
  /** 当前文件夹直属资产数量 */
  assetCount: number
}

export interface LibraryRootInfo {
  root: string
  isDefault: boolean
}

/** 多选批量入库：来源节点输出 */
export interface SaveAssetInput {
  path: string
  scope?: 'project' | 'global'
  name?: string
}

export interface AddToLibraryInput {
  /** project scope 时为项目内相对路径；global scope 时为库内相对路径 */
  sourcePath: string
  scope: 'project' | 'global'
  /** 目标文件夹，相对库根 */
  folder: string
  /** 期望文件名，不含扩展名 */
  name: string
}

/** 角色卡是「角色」文件夹的只读投影，不再单独落 JSON */
export interface CharacterCard {
  /** 相对库根的路径：角色/林小雨 或 角色/单人.png */
  id: string
  name: string
  description: string
  avatarPath?: string
  referencePaths: string[]
  createdAt: string
  updatedAt: string
}

export interface PromptTemplate {
  /** 相对库根的路径，例如 提示词/雪夜电影感.prompt.json */
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

export const DEFAULT_LIBRARY_FOLDERS = [
  '角色',
  '场景',
  '道具',
  '风格',
  '音频',
  '提示词'
] as const

export const CHARACTER_FOLDER = '角色'
export const PROMPT_FOLDER = '提示词'
export const TEMPLATE_EXT = '.prompt.json'
