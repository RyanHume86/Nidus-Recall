import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import UserNotRegisteredError from '@/components/UserNotRegisteredError'
import { LegalPage } from '@/pages/legal/LegalPage'
import Home from './pages/Home'

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F7F5", color: "#7BA090", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", fontSize: 14 }}>
        Loading...
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route path="/privacy"          element={<LegalPage type="privacy" />} />
      <Route path="/terms"            element={<LegalPage type="terms" />} />
      <Route path="/data-processing"  element={<LegalPage type="data-processing" />} />
      <Route path="/*"                element={<Home />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthenticatedApp />
      </Router>
    </AuthProvider>
  );
}

export default App;