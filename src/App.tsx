import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout, RequireInvite } from './components/Layout'
import { AuthProvider } from './lib/auth'
import { Demo } from './pages/Demo'
import { Guide } from './pages/Guide'
import { JobPage } from './pages/JobPage'
import { Jobs } from './pages/Jobs'
import { Landing } from './pages/Landing'
import { Login, Waitlisted } from './pages/Login'
import { SharePage } from './pages/SharePage'
import { Upload } from './pages/Upload'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/waitlisted" element={<Waitlisted />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/s/:token" element={<SharePage />} />
            <Route path="/guide" element={<RequireInvite><Guide /></RequireInvite>} />
            <Route path="/upload" element={<RequireInvite><Upload /></RequireInvite>} />
            <Route path="/jobs" element={<RequireInvite><Jobs /></RequireInvite>} />
            <Route path="/jobs/:id" element={<RequireInvite><JobPage /></RequireInvite>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthProvider>
  )
}
