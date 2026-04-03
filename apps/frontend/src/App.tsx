import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrderEntryPage from './pages/OrderEntryPage';
import ProcessingQueuePage from './pages/ProcessingQueuePage';
import ProcessingCasePage from './pages/ProcessingCasePage';
import ResultQueuePage from './pages/ResultQueuePage';
import ResultCasePage from './pages/ResultCasePage';
import QueryPage from './pages/QueryPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/order-entry" element={<OrderEntryPage />} />
                <Route path="/processing" element={<ProcessingQueuePage />} />
                <Route path="/processing/:orderId" element={<ProcessingCasePage />} />
                <Route path="/result" element={<ResultQueuePage />} />
                <Route path="/result/:orderId" element={<ResultCasePage />} />
                <Route path="/query" element={<QueryPage />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
