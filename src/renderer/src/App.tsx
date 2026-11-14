import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BottomBar } from './canvas/BottomBar'
import { Canvas } from './canvas/Canvas'
import { StatusBar } from './canvas/StatusBar'
import { TopBar } from './canvas/TopBar'
import { AppTooltip } from './components/AppTooltip'
import { BrandWordmark } from './components/Brand'
import { Toast } from './components/Toast'
import { WindowControls } from './components/WindowControls'
import { ConfirmDialog } from './panels/ConfirmDialog'
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
const FilmStudyRoom = lazy(() =>
  import('./canvas/nodes/FilmStudyRoom').then((module) => ({
    default: module.FilmStudyRoom
  }))
)
const FilmStudySheet = lazy(() =>
  import('./canvas/nodes/FilmStudySheet').then((module) => ({
    default: module.FilmStudySheet
  }))
)
import { AgentPanel } from './agent/AgentPanel'
import { initAgentCanvasBridge } from './agent/canvasBridge'
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
  const studyOpen = useFilmStudyStore((state) => Boolean(state.study))
  const sheetOpen = useFilmStudyStore((state) => Boolean(state.sheetNodeId))

  const loadProviders = useSettingsStore((state) => state.load)
  const subscribeGeneration = useGenerationStore((state) => state.subscribe)
  const subscribeFilmStudy = useFilmStudyStore((state) => state.subscribe)
  const initUpdate = useUpdateStore((state) => state.init)
  const loadPreferences = usePreferencesStore((state) => state.load)
  const historyLimit = usePreferencesStore(
    (state) => state.preferences.generation.historyLimit
  )
  const confirmBeforeClose = usePreferencesStore(
    (state) => state.preferences.project.confirmBeforeClose
  )

  useEffect(() => {
    void loadPreferences()
  }, [loadPreferences])

  useEffect(() => {
    useGenerationHistoryStore.getState().trim()
  }, [historyLimit])

  useEffect(() => {
    return window.api.app.onCloseRequested(() => {
      const project = useProjectStore.getState()
      const dirty = project.dirty || project.saving
      const close = (): void => window.api.app.confirmClose()

      if (!dirty) {
        close()
        return
      }

      if (!confirmBeforeClose) {
        void project.saveNow().finally(close)
        return
      }

      useUIStore.getState().requestConfirm({
        title: '退出 CineLab',
        message: '当前项目还有未保存的修改，退出前会自动保存。',
        confirmLabel: '保存并退出',
        onConfirm: async () => {
          await useProjectStore.getState().saveNow()
          close()
        }
      })
    })
  }, [confirmBeforeClose])

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
    const unsubscribe = subscribeGeneration()
    return unsubscribe
  }, [subscribeGeneration])

  useEffect(() => {
    const unsubscribe = subscribeFilmStudy()
    return unsubscribe
  }, [subscribeFilmStudy])

  useEffect(() => subscribeDepthTasks(), [])

  useEffect(() => subscribeVisionTasks(), [])

  useEffect(() => {
    const unsubscribeEvent = window.api.agent.onEvent((event) => {
      useAgentStore.getState().applyEvent(event)
    })
    const unsubscribeBridge = initAgentCanvasBridge()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
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
      <div className="boot-screen">
        <BrandWordmark height={22} className="boot-screen__logo" />
        <div className="boot-screen__hint">正在打开项目…</div>
      </div>
    )
  } else if (phase === 'welcome') {
    content = <ProjectCenter />
  } else if (phase === 'error') {
    content = (
      <div className="boot-screen">
        <BrandWordmark height={22} className="boot-screen__logo" />
        <div className="boot-screen__hint">项目打开失败</div>
        <div className="boot-screen__error">{error}</div>
        <Button
          type="button"
          className="empty-action"
          onClick={() => void bootstrap()}
          unstyled
        >
          重试
        </Button>
      </div>
    )
  } else {
    content = (
      <div className="app-shell">
        <Canvas key={canvasId ?? 'canvas'} theme={resolved} />
        <TopBar />
        <BottomBar />
        <StatusBar />
        <LibraryPanel />
        <ToolbarSettings />
        <ConfirmDialog />
        {error ? (
          <ToastView unstyled className="toast">
            {error}
          </ToastView>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {content}
      {phase === 'ready' ? null : <div className="window-drag-strip" />}
      <SettingsPanel />
      {studioOpen ? (
        <Suspense fallback={null}>
          <StudioWindow />
        </Suspense>
      ) : null}
      {stageOpen ? (
        <Suspense fallback={null}>
          <StageWindow />
        </Suspense>
      ) : null}
      {studyOpen ? (
        <Suspense fallback={null}>
          <FilmStudyRoom />
        </Suspense>
      ) : null}
      {sheetOpen ? (
        <Suspense fallback={null}>
          <FilmStudySheet />
        </Suspense>
      ) : null}
      {phase === 'ready' ? <AgentPanel /> : null}
      <WindowControls theme={resolved} onToggleTheme={toggle} />
      <Toast />
      <AppTooltip />
    </>
  )
}
