import { AppProvider } from './context/AppContext'
import { MainLayout } from './components/MainLayout'
import './index.css'

function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  )
}

export default App
