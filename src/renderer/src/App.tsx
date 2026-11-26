import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode
} from 'react'
import { BottomBar } from './canvas/BottomBar'
import { Canvas } from './canvas/Canvas'
import { StatusBar } from './canvas/StatusBar'
import { WorkflowSaveDialog } from './canvas/WorkflowSaveDialog'
import { TopBar } from './canvas/TopBar'
import { AppTooltip } from './components/AppTooltip'
import { BrandWordmark } from './components/Brand'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toast } from './components/Toast'
import { WindowControls } from './components/WindowControls'
import { ConfirmDialog } from './panels/ConfirmDialog'
import { CloseConfirmDialog } from './components/CloseConfirmDialog'
import { LibraryPanel } from './panels/LibraryPanel'
import { ToolbarSettings } from './canvas/nodes/ToolbarSettings'
import { ProjectCenter } from './panels/ProjectCenter'
import { SettingsPanel } from './panels/SettingsPanel'
const StudioWindow = lazy(() =>
  import('./studio/StudioWindow').then((module) => ({
    default: module.StudioWindow
  }))
)
const StageWindow = lazy(() =>
  import('./stage/StageWindow').then((module) => ({
    default: module.StageWindow
  }))
)
const FilmStudySheet = lazy(() =>
  import('./canvas/nodes/FilmStudySheet').then((module) => ({
    default: module.FilmStudySheet
  }))
)
const RemakeMappingDialog = lazy(() =>
  import('./canvas/nodes/RemakeMappingDialog').then((module) => ({
    default: module.RemakeMappingDialog
  }))
)
import { AgentPanel } from './agent/AgentPanel'
import { initAgentBridge } from './agent/commandHandlers'
import { initMcpCommandBridge } from './mcp/commandBridge'
import { shortcutMatches } from './shortcuts/useShortcut'
import { useAgentStore } from './agent/agentStore'
import { useCanvasStore } from './stores/canvas'
import { useGenerationStore } from './stores/generation'
import { useGenerationHistoryStore } from './stores/generation-history'
import { useFilmStudyStore } from './stores/film-study'
import { usePreferencesStore } from './stores/preferences'
import { useProjectStore } from './stores/project'
import { useSettingsStore } from './stores/settings'
import { useUIStore } from './stores/ui'
import { useUpdateStore } from './stores/update'
import { subscribeDepthTasks } from './stores/depth-tasks'
import {
  cancelAllTrackedStemTasks,
  subscribeStemTasks
} from './stores/stem-tasks'
import { subscribeVisionTasks } from './stores/vision-tasks'
import { useTheme } from './theme/useTheme'
import { useStudioStore } from './stores/studio'
import { useStageStore } from './stage/stageStore'
import { Button, Toast as ToastView } from './components/ui'

export default function App() {
  const { resolved, toggle } = useTheme()

  const phase = useProjectStore((state) => state.phase)
  const bootstrap = useProjectStore((state) => state.bootstrap)
  const scheduleSave = useProjectStore((state) => state.scheduleSave)
  const error = useProjectStore((state) => state.error)
  const canvasId = useProjectStore((state) => state.canvasId)

  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const hydrated = useCanvasStore((state) => state.hydrated)

  const studioOpen = useStudioStore((state) => state.open)
  const stageOpen = useStageStore((state) => state.open)
  const sheetOpen = useFilmStudyStore((state) => Boolean(state.sheetNodeId))

  const loadProviders = useSettingsStore((state) => state.load)
  const subscribeGeneration = useGenerationStore((state) => state.subscribe)
  const subscribeFilmStudy = useFilmStudyStore((state) => state.subscribe)
  const initUpdate = useUpdateStore((state) => state.init)
  const loadPreferences = usePreferencesStore((state) => state.load)
  const historyLimit = usePreferencesStore(
    (state) => state.preferences.generation.historyLimit
  )
  const closeDefaultAction = usePreferencesStore(
    (state) => state.preferences.project.closeDefaultAction
  )
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)

  useEffect(() => {
    void loadPreferences()
  }, [loadPreferences])

  useEffect(() => {
    useGenerationHistoryStore.getState().trim()
  }, [historyLimit])

  const performClose = useCallback(
    async (action: 'background' | 'quit', remember: boolean): Promise<void> => {
      cancelAllTrackedStemTasks()
      try {
        await useProjectStore.getState().saveNow()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        useUIStore
          .getState()
          .showToast(`保存失败，已取消关闭：${message}`, 'error')
        return
      }
      if (remember) {
        await usePreferencesStore
          .getState()
          .updateProject({ closeRememberBackground: true })
      }
      if (action === 'background') window.api.app.hideToTray()
      else window.api.app.quit()
    },
    []
  )

  useEffect(() => {
    const handleClose = (): void => {
      const settings = usePreferencesStore.getState().preferences.project
      if (settings.closeRememberBackground) {
        void performClose('background', false)
        return
      }
      if (!settings.confirmBeforeClose) {
        void performClose(settings.closeDefaultAction, false)
        return
      }
      setCloseDialogOpen(true)
    }
    const offClose = window.api.app.onCloseRequested(handleClose)
    const offQuit = window.api.app.onQuitRequested(() => setCloseDialogOpen(true))
    return () => {
      offClose()
      offQuit()
    }
  }, [performClose])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    initUpdate()
  }, [initUpdate])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    return window.api.localAdapters.onChanged(() => {
      void loadProviders()
    })
  }, [loadProviders])

  useEffect(() => {
    const unsubscribe = subscribeGeneration()
    return unsubscribe
  }, [subscribeGeneration])

  useEffect(() => {
    const unsubscribe = subscribeFilmStudy()
    return unsubscribe
  }, [subscribeFilmStudy])

  useEffect(() => subscribeDepthTasks(), [])

  useEffect(() => subscribeVisionTasks(), [])

  useEffect(() => subscribeStemTasks(), [])

  useEffect(() => {
    const unsubscribeEvent = window.api.agent.onEvent((event) => {
      useAgentStore.getState().applyEvent(event)
    })
    const unsubscribeBridge = initAgentBridge()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (shortcutMatches(event, 'app.agent.toggle')) {
        event.preventDefault()
        useAgentStore.getState().toggle()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      unsubscribeEvent()
      unsubscribeBridge()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => initMcpCommandBridge(), [])

  useEffect(() => {
    if (!hydrated || phase !== 'ready') return
    scheduleSave()
  }, [nodes, edges, hydrated, phase, scheduleSave])

  useEffect(() => {
    const onWheel = (event: WheelEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return

      let element: HTMLElement | null = target as HTMLElement
      while (element && element !== document.body) {
        const style = window.getComputedStyle(element)
        const scrollable =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          element.scrollHeight > element.clientHeight
        if (scrollable) {
          event.stopPropagation()
          return
        }
        element = element.parentElement
      }
    }

    document.addEventListener('wheel', onWheel, {
      capture: true,
      passive: true
    })
    return () =>
      document.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  let content: ReactNode

  if (phase === 'loading') {
    content = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-canvas">
        <BrandWordmark height={22} className="text-[20px] font-bold tracking-[0.02em]" />
        <div className="text-[13px] text-fg-muted">正在打开项目…</div>
      </div>
    )
  } else if (phase === 'welcome') {
    content = <ProjectCenter />
  } else if (phase === 'error') {
    content = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-canvas">
        <BrandWordmark height={22} className="text-[20px] font-bold tracking-[0.02em]" />
        <div className="text-[13px] text-fg-muted">项目打开失败</div>
        <div className="max-w-[520px] break-all text-center text-xs text-danger">{error}</div>
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="h-11 gap-2 !rounded-card bg-surface px-4 text-[13px] !font-normal hover:bg-surface-hover"
          onClick={() => void bootstrap()}
        >
          重试
        </Button>
      </div>
    )
  } else {
    content = (
      <div className="relative h-full w-full bg-canvas">
        <Canvas key={canvasId ?? 'canvas'} theme={resolved} />
        <TopBar />
        <BottomBar />
        <StatusBar />
        <LibraryPanel />
        <ToolbarSettings />
        {error ? <ToastView tone="error">{error}</ToastView> : null}
      </div>
    )
  }

  return (
    <>
      <ErrorBoundary>{content}</ErrorBoundary>
      {phase === 'ready' ? null : (
        <div className="fixed inset-x-0 top-0 z-[15] h-10 [-webkit-app-region:drag]" />
      )}
      <SettingsPanel />
      <ConfirmDialog />
      <CloseConfirmDialog
        open={closeDialogOpen}
        defaultAction={closeDefaultAction}
        onBackground={(remember) => {
          setCloseDialogOpen(false)
          void performClose('background', remember)
        }}
        onQuit={() => {
          setCloseDialogOpen(false)
          void performClose('quit', false)
        }}
        onCancel={() => setCloseDialogOpen(false)}
      />
      <WorkflowSaveDialog />
      {studioOpen ? (
        <Suspense fallback={null}>
          <StudioWindow />
        </Suspense>
      ) : null}
      {stageOpen ? (
        <ErrorBoundary label="导演台加载失败">
          <Suspense fallback={null}>
            <StageWindow />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      {sheetOpen ? (
        <Suspense fallback={null}>
          <FilmStudySheet />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <RemakeMappingDialog />
      </Suspense>
      {phase === 'ready' ? <AgentPanel /> : null}
      <WindowControls theme={resolved} onToggleTheme={toggle} />
      <Toast />
      <AppTooltip />
    </>
  )
}
