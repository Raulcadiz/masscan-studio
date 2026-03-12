import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import DashboardPage from './pages/DashboardPage'
import ScansPage from './pages/ScansPage'
import NewScanPage from './pages/NewScanPage'
import ScanDetailPage from './pages/ScanDetailPage'
import ComparatorPage from './pages/ComparatorPage'
import ProxyCheckerPage from './pages/ProxyCheckerPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"           element={<DashboardPage />} />
        <Route path="/scans"      element={<ScansPage />} />
        <Route path="/scans/new"  element={<NewScanPage />} />
        <Route path="/scans/:id"  element={<ScanDetailPage />} />
        <Route path="/compare"    element={<ComparatorPage />} />
        <Route path="/proxies"    element={<ProxyCheckerPage />} />
      </Routes>
    </Layout>
  )
}
