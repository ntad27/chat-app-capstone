import { Layout } from './components/Layout'
import { useEventStream } from './hooks/use-event-stream'

function App() {
  useEventStream()

  return <Layout />
}

export default App
