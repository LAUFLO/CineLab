# 07 存储、IPC 与安全

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

项目文件格式、主进程 IPC、preload 暴露、设置、素材库、导出、安全策略、更新、组件运行时。

## 不负责什么

- 不做画布/导演台业务逻辑（见 01/04）。
- 不做模型供应商适配（见 02）。

## 项目与目录

- 项目文件夹后缀 `.cinelab`；`project/manager.ts` 负责创建、打开、保存、最近项目、封面、模板。
- 原子写入：临时文件 + rename；画布保存用 hash 去重。
- 最近项目：`userData/recent-projects.json`。
- 默认项目目录：偏好设置里的 `project.defaultDir`，否则 `Documents/CineLab`。

项目根常见结构：

```
<project>.cinelab/
  canvases/<id>.json          画布
  timelines/<id>.json         时间线
  stages/<id>.json            导演台
  stages/<id>.world.json      程序化世界
  study/<id>.json             拉片
  assets/                     项目素材（含 study/<id>/frames）
  exports/                    导出物
  .cinelab/
    agent/sessions/*.jsonl    Agent 会话
    agent/proposals/          Agent 提案
    skills/                   项目技能
```

## IPC 与 preload

`shared/ipc-contract.ts` 定义 `CineApi`；`preload/index.ts` 用 `contextBridge` 暴露，渲染进程不直接访问 Node/Electron。

IPC 模块（`main/ipc/`）：`app`、`project`、`settings`、`generate`、`library`、`media`、`timeline`、`film-study`、`stage`、`agent`、`skills`、`components`、`export`、`scene`、`update`、`clipboard`。

完整接口与方法见 [_generated.md](_generated.md) 的「IPC 接口」。

## 设置

`main/settings/`：

- `store.ts`：Provider/模型配置读写；
- `models-config.ts`：`models.json` 结构；
- `models-watch.ts`：文件监听；
- `apply.ts`：应用配置；
- `preferences.ts`：用户偏好；
- `capability-report.ts`：模型能力报告；
- `model-skill.ts`：模型技能。

## 素材库

`main/library/`：`config.ts`（根目录）、`store.ts`（索引/读写）、`tags.ts`/`tag-utils.ts`、`templates.ts`、`thumbs.ts`、`concurrency.ts`。

## 导出

`main/export/`：`project-export.ts`（整项目导出）、`zip.ts`（ZIP 封装）。时间线/导演台/拉片各自的导出在各模块内。

## 安全

- `security/external-url.ts`：白名单外部链接；
- `security/navigation.ts`：限制窗口导航；
- `window.ts`：窗口创建、关闭控制、错误日志；
- 渲染进程禁用 Node，所有文件/网络走主进程。

## 更新与组件

- `main/update/service.ts` + `fallback.ts`：应用内更新与回退；
- `main/components/`：组件清单、下载、安装、ZIP 解压、服务（本地 AI 运行时、视觉、转录、人声分离模型等组件）。

## 数据流

```
Renderer
  → preload（CineApi）
  → main/ipc/*
  → 业务模块（project/settings/library/...）
  → 项目文件 / userData / exports
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 项目打开/保存/最近/封面/模板 | 已实现 | `project/manager.ts`、`manager.test.ts` |
| IPC/preload | 已实现 | `ipc-contract.ts`、`main/ipc/` |
| 设置/模型配置 | 已实现 | `settings/`、`models-config.test.ts` |
| 素材库 | 已实现 | `library/`、`store.test.ts` |
| 导出/ZIP | 已实现 | `export/`、`project-export.test.ts` |
| 安全策略 | 已实现 | `security/`、`external-url.test.ts`、`navigation.test.ts` |
| 更新/组件 | 已实现 | `update/`、`components/`、`fallback.test.ts` |

## 已知限制

- IPC 合同变更会影响 preload 与渲染进程，改前先搜索所有调用点。
- 存储用 JSON/JSONL，不引入 SQLite 或原生模块。
- 项目目录里的 `.cinelab/agent`、`skills` 是运行时数据，迁移/备份要整目录保留。
- 组件运行时（深度/视觉/转录）未安装时相关功能不可用。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| IPC 合同 | `src/shared/ipc-contract.ts`、`src/main/ipc/` |
| preload | `src/preload/index.ts` |
| 项目文件 | `src/shared/project-schema.ts`、`src/main/project/manager.ts` |
| 设置/偏好 | `src/shared/preferences.ts`、`src/main/settings/` |
| 素材库 | `src/shared/library-schema.ts`、`src/main/library/` |
| 导出 | `src/main/export/` |
| 安全 | `src/main/security/`、`src/main/window.ts` |
| 更新/组件 | `src/main/update/`、`src/main/components/` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/components/downloader.ts` | 114 |
| `src/main/components/installer.ts` | 82 |
| `src/main/components/manifest.ts` | 210 |
| `src/main/components/service.ts` | 219 |
| `src/main/components/zip-extract.ts` | 158 |
| `src/main/export/project-export.ts` | 135 |
| `src/main/export/zip.ts` | 159 |
| `src/main/index.ts` | 206 |
| `src/main/ipc/agent.ts` | 464 |
| `src/main/ipc/clipboard.ts` | 39 |
| `src/main/ipc/components.ts` | 43 |
| `src/main/ipc/export.ts` | 310 |
| `src/main/ipc/film-study.ts` | 244 |
| `src/main/ipc/generate.ts` | 73 |
| `src/main/ipc/index.ts` | 128 |
| `src/main/ipc/library.ts` | 192 |
| `src/main/ipc/local-adapters.ts` | 22 |
| `src/main/ipc/media.ts` | 230 |
| `src/main/ipc/project.ts` | 158 |
| `src/main/ipc/scene.ts` | 54 |
| `src/main/ipc/settings.ts` | 155 |
| `src/main/ipc/skills.ts` | 168 |
| `src/main/ipc/stage.ts` | 152 |
| `src/main/ipc/timeline.ts` | 165 |
| `src/main/ipc/update.ts` | 22 |
| `src/main/library/concurrency.ts` | 26 |
| `src/main/library/config.ts` | 85 |
| `src/main/library/store.ts` | 543 |
| `src/main/library/tag-utils.ts` | 4 |
| `src/main/library/tags.ts` | 96 |
| `src/main/library/templates.ts` | 137 |
| `src/main/library/thumbs.ts` | 71 |
| `src/main/logger.ts` | 34 |
| `src/main/menu.ts` | 49 |
| `src/main/project/manager.ts` | 433 |
| `src/main/protocol.ts` | 159 |
| `src/main/security/external-url.ts` | 14 |
| `src/main/security/navigation.ts` | 32 |
| `src/main/settings/apply.ts` | 36 |
| `src/main/settings/capability-report.ts` | 31 |
| `src/main/settings/model-skill.ts` | 20 |
| `src/main/settings/models-config.ts` | 981 |
| `src/main/settings/models-watch.ts` | 94 |
| `src/main/settings/preferences.ts` | 74 |
| `src/main/settings/store.ts` | 635 |
| `src/main/types/ffprobe-static.d.ts` | 11 |
| `src/main/update/fallback.ts` | 147 |
| `src/main/update/service.ts` | 263 |
| `src/main/window.ts` | 153 |
| `src/preload/index.d.ts` | 10 |
| `src/preload/index.ts` | 585 |
| `src/renderer/src/stores/depth-tasks.ts` | 70 |
| `src/renderer/src/stores/library.ts` | 362 |
| `src/renderer/src/stores/preferences.ts` | 286 |
| `src/renderer/src/stores/project.ts` | 263 |
| `src/renderer/src/stores/settings.ts` | 65 |
| `src/renderer/src/stores/update.ts` | 41 |
| `src/shared/asset-schema.ts` | 16 |
| `src/shared/ipc-contract.ts` | 631 |
| `src/shared/library-schema.ts` | 98 |
| `src/shared/models-file.ts` | 66 |
| `src/shared/preferences.ts` | 351 |
| `src/shared/project-schema.ts` | 438 |
| `src/shared/project-templates.ts` | 255 |
| `src/shared/template-vars.ts` | 66 |
| `src/shared/update.ts` | 44 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/components/downloader.ts` | `DownloadOptions`、`downloadFile` |
| `src/main/components/installer.ts` | `MODEL_FILES`、`installComponentFiles` |
| `src/main/components/manifest.ts` | `ComponentDefinition`、`COMPONENTS`、`COMPONENT_KINDS`、`fetchManifest` |
| `src/main/components/service.ts` | `componentsRoot`、`componentDirectory`、`listComponentStatus`、`installComponent`、`pauseComponent`、`removeComponent`、`isComponentInstalled` |
| `src/main/components/zip-extract.ts` | `ZipLimits`、`isSafeZipEntryName`、`isSymlinkEntry`、`extractZipSafely` |
| `src/main/export/project-export.ts` | `stageProjectExport`、`exportProjectWithAssets` |
| `src/main/export/zip.ts` | `zipDirectory` |
| `src/main/ipc/agent.ts` | `registerAgentIpc` |
| `src/main/ipc/clipboard.ts` | `registerClipboardIpc` |
| `src/main/ipc/components.ts` | `registerComponentsIpc` |
| `src/main/ipc/export.ts` | `registerExportIpc` |
| `src/main/ipc/film-study.ts` | `registerFilmStudyIpc` |
| `src/main/ipc/generate.ts` | `registerGenerateIpc` |
| `src/main/ipc/index.ts` | `registerIpc` |
| `src/main/ipc/library.ts` | `registerLibraryIpc` |
| `src/main/ipc/local-adapters.ts` | `registerLocalAdapterIpc` |
| `src/main/ipc/media.ts` | `registerMediaIpc` |
| `src/main/ipc/project.ts` | `registerProjectIpc` |
| `src/main/ipc/scene.ts` | `registerSceneIpc` |
| `src/main/ipc/settings.ts` | `registerSettingsIpc` |
| `src/main/ipc/skills.ts` | `registerSkillsIpc` |
| `src/main/ipc/stage.ts` | `registerStageIpc` |
| `src/main/ipc/timeline.ts` | `registerTimelineIpc` |
| `src/main/ipc/update.ts` | `registerUpdateIpc` |
| `src/main/library/concurrency.ts` | `mapLimit` |
| `src/main/library/config.ts` | `defaultLibraryRoot`、`ensureLibrary`、`getLibraryRoot`、`setLibraryRoot`、`resetLibraryRoot` |
| `src/main/library/store.ts` | `listAssets`、`listTree`、`listAllAssets`、`createFolder`、`renameFolder`、`deleteFolder`、`importFiles`、`addAsset`、`renameAsset`、`moveAsset`、`deleteAsset`、`revealPath`、`listCharacters` |
| `src/main/library/tag-utils.ts` | `normalizeTags` |
| `src/main/library/tags.ts` | `AssetTagMap`、`readAssetTags`、`setAssetTags`、`moveAssetTags`、`deleteAssetTags`、`deleteFolderTags` |
| `src/main/library/templates.ts` | `listTemplates`、`saveTemplate`、`deleteTemplate` |
| `src/main/library/thumbs.ts` | `getThumbCacheInfo`、`clearThumbCache`、`cleanupThumbCache` |
| `src/main/logger.ts` | `setupLogging`、`logDirectory` |
| `src/main/menu.ts` | `installApplicationMenu` |
| `src/main/project/manager.ts` | `setCurrentProjectRoot`、`getCurrentProjectRoot`、`defaultProjectsDir`、`readRecent`、`writeProjectCover`、`writeProjectCoverFromAsset`、`readProjectCover`、`removeProjectCover`、`createProject`、`openProject`、`saveCanvas`、`bootstrap`、`bootstrapOnce`、`projectNameFromPath`、`renameProject`、`createCanvas`、`switchCanvas`、`renameCanvas`、`deleteCanvas`、`deleteProject` |
| `src/main/protocol.ts` | `ASSET_SCHEME`、`registerAssetScheme`、`registerAssetProtocol` |
| `src/main/security/external-url.ts` | `isAllowedExternalUrl` |
| `src/main/security/navigation.ts` | `isAllowedNavigation` |
| `src/main/settings/apply.ts` | `applyRuntimePreferences` |
| `src/main/settings/capability-report.ts` | `reportCapabilityGaps` |
| `src/main/settings/model-skill.ts` | `modelSkillPath`、`readModelSkill` |
| `src/main/settings/models-config.ts` | `parseModelsFile`、`modelsFilePath`、`pendingModelsFilePath`、`PendingModelsConfig`、`loadPendingModels`、`applyPendingModels`、`autoApplyPendingModels`、`discardPendingModels`、`LoadedModelsConfig`、`loadModelsConfig`、`saveModelsConfig`、`enqueueModelsWrite`、`upsertModelsProvider`、`removeModelsProvider`、`resolveModels`、`toModelsProvider`、`modelsConfigStatus`、`ensureModelsFile` |
| `src/main/settings/models-watch.ts` | `startModelsWatcher`、`stopModelsWatcher` |
| `src/main/settings/preferences.ts` | `getPreferences`、`savePreferences`、`resetPreferences` |
| `src/main/settings/store.ts` | `ensureMigrated`、`listProviders`、`ResolvedProvider`、`resolveProvider`、`saveProvider`、`deleteProvider`、`getOperationBindings`、`saveOperationBindings`、`testConnection`、`fetchModels` |
| `src/main/update/fallback.ts` | `RELEASES_URL`、`REPOSITORY_URL`、`PROBE_URL`、`MIRROR_TIMEOUT`、`DEFAULT_MIRRORS`、`PendingInstaller`、`UpdateFileLike`、`UpdateInfoLike`、`mirrorPrefixes`、`installerFor`、`hostOf`、`releasesFallback`、`installerFallback`、`probeMirror`、`resolveInstallerFallback` |
| `src/main/update/service.ts` | `getUpdateStatus`、`checkForUpdates`、`downloadUpdate`、`installUpdate`、`openFallbackDownload`、`initUpdateService`、`shutdownUpdateService` |
| `src/main/window.ts` | `brandIconPath`、`allowWindowClose`、`allowAllWindowClose`、`createMainWindow` |
| `src/renderer/src/stores/depth-tasks.ts` | `trackDepthTask`、`subscribeDepthTasks` |
| `src/renderer/src/stores/library.ts` | `PendingAdd`、`useLibraryStore`、`PROMPT_FOLDER_PATH` |
| `src/renderer/src/stores/preferences.ts` | `usePreferencesStore` |
| `src/renderer/src/stores/project.ts` | `useProjectStore` |
| `src/renderer/src/stores/settings.ts` | `useSettingsStore` |
| `src/renderer/src/stores/update.ts` | `useUpdateStore` |
| `src/shared/asset-schema.ts` | `AssetScope`、`isGlobalScope`、`AssetRef` |
| `src/shared/ipc-contract.ts` | `ThemeMode`、`AppInfo`、`ProjectApi`、`SettingsApi`、`GenerateApi`、`LibraryApi`、`ExportResult`、`ClipboardContent`、`ClipboardApi`、`ExportApi`、`MediaApi`、`ComponentsApi`、`TimelineExportProgress`、`TimelineExportResult`、`TimelineVideoCodec`、`TimelineExportSettings`、`TimelineTranscribeRequest`、`TimelineTranscribeSegment`、`TimelineTranscribeResult`、`TimelineTranscribeProgress`、`TimelineAnalysisKind`、`TimelineAnalysisRequest`、`TimelineAnalysisMarker`、`TimelineAnalysisResult` …（共 44 个） |
| `src/shared/library-schema.ts` | `LibraryAssetKind`、`LibraryAsset`、`LibraryFolderNode`、`LibraryRootInfo`、`ThumbCacheInfo`、`SaveAssetInput`、`AddToLibraryInput`、`CharacterCard`、`PromptTemplate`、`TemplateInput`、`DEFAULT_LIBRARY_FOLDERS`、`CHARACTER_FOLDER`、`PROMPT_FOLDER`、`TEMPLATE_EXT` |
| `src/shared/models-file.ts` | `ModelsFileModel`、`ModelsFileProvider`、`ModelsFile`、`ModelsConfigStatus` |
| `src/shared/preferences.ts` | `CapabilityGroup`、`CanvasScrollMode`、`CanvasGridStyle`、`ProxyMode`、`Preferences`、`PREFERENCES_VERSION`、`AUTO_SAVE_DELAYS`、`GENERATION_CONCURRENCY`、`HISTORY_LIMITS`、`AUTO_RETRY_COUNTS`、`UI_SCALES`、`CACHE_CLEAN_DAYS`、`REQUEST_TIMEOUTS`、`DEFAULT_PREFERENCES`、`normalizePreferences` |
| `src/shared/project-schema.ts` | `nodeKindSchema`、`outputRefSchema`、`nodeStatusSchema`、`groupColorSchema`、`cineNodeSchema`、`studioNodeSchema`、`stageNodeSchema`、`filmNodeSchema`、`videoOpNodeSchema`、`groupNodeSchema`、`canvasNodeSchema`、`cineEdgeSchema`、`canvasDataSchema`、`projectMetaSchema`、`ProjectMeta`、`CanvasData`、`PersistedCineNode`、`PersistedStudioNode`、`PersistedStageNode`、`PersistedFilmNode`、`PersistedNode`、`PersistedEdge`、`ProjectSnapshot`、`RecentProject` |
| `src/shared/project-templates.ts` | `ProjectTemplateId`、`ProjectTemplate`、`PROJECT_TEMPLATES`、`buildTemplateCanvas` |
| `src/shared/template-vars.ts` | `TemplateTokenResolver`、`replaceTemplateVariables`、`createTemplateResolver` |
| `src/shared/update.ts` | `UpdateState`、`UpdateFallbackKind`、`UpdateFallback`、`UpdateStatus`、`UpdateApi` |
<!-- AUTO:exports:end -->
