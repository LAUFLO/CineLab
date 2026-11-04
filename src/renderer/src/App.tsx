import { BottomBar } from './canvas/BottomBar'
import { Canvas } from './canvas/Canvas'
import { StatusBar } from './canvas/StatusBar'
import { TopBar } from './canvas/TopBar'
import { useTheme } from './theme/useTheme'

export default function App() {
  const { resolved, toggle } = useTheme()

  return (
    <div className="app-shell">
      <Canvas theme={resolved} />
      <TopBar theme={resolved} onToggleTheme={toggle} />
      <BottomBar />
      <StatusBar />
    </div>
  )
}
