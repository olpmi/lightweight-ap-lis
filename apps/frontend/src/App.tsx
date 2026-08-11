import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Alert, CircularProgress, Box } from '@mui/material';
import { EMPLOYEE_ROLES, type EmployeeRoleName } from '@lis/shared';
import { useAuth } from './hooks/useAuth';
import { useLanguage } from './hooks/useLanguage';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrderEntryPage from './pages/OrderEntryPage';
import ProcessingQueuePage from './pages/ProcessingQueuePage';
import ProcessingCasePage from './pages/ProcessingCasePage';
import ResultQueuePage from './pages/ResultQueuePage';
import ResultCasePage from './pages/ResultCasePage';
import QueryPage from './pages/QueryPage';
import ConfigTemplatesPage from './pages/ConfigTemplatesPage';
import ConfigReportManagerPage from './pages/ConfigReportManagerPage';
import AncillaryQueuePage from './pages/AncillaryQueuePage';
import ConfigAncillaryPage from './pages/ConfigAncillaryPage';
import ConfigPatientSummariesPage from './pages/ConfigPatientSummariesPage';
import ConfigDataImportPage from './pages/ConfigDataImportPage';
import HistologyQueuePage from './pages/HistologyQueuePage';
import HistologyCasePage from './pages/HistologyCasePage';

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

/**
 * Route-level role gate.
 *
 * Renders a message rather than redirecting: a user who follows a bookmark to a
 * page their role cannot reach should be told why, not bounced somewhere else
 * with no explanation. The API enforces the same rule regardless.
 */
function RequireRole({ allow, children }: { allow: EmployeeRoleName[]; children: React.ReactNode }) {
  const { hasRole } = useAuth();
  const { t } = useLanguage();

  if (!hasRole(...allow)) {
    return (
      <Box p={4} display="flex" justifyContent="center">
        <Alert severity="warning" data-testid="forbidden-notice" sx={{ maxWidth: 600 }}>
          {t('errorForbidden')}
        </Alert>
      </Box>
    );
  }
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
                <Route path="/histology" element={<HistologyQueuePage />} />
                <Route path="/histology/:orderId" element={<HistologyCasePage />} />
                <Route path="/ancillary" element={<AncillaryQueuePage />} />
                <Route path="/query" element={<QueryPage />} />
                {/* The configuration surface is Administrator-only, matching the
                    guards on /api/config/*. Data Import in particular creates
                    staff accounts. */}
                <Route
                  path="/config/*"
                  element={
                    <RequireRole allow={[EMPLOYEE_ROLES.ADMINISTRATOR]}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/config/templates" replace />} />
                        <Route path="templates/*" element={<ConfigTemplatesPage />} />
                        <Route path="reports" element={<ConfigReportManagerPage />} />
                        <Route path="reports/:id" element={<ConfigReportManagerPage />} />
                        <Route path="ancillary" element={<ConfigAncillaryPage />} />
                        <Route path="patient-summaries" element={<ConfigPatientSummariesPage />} />
                        <Route path="data-import" element={<ConfigDataImportPage />} />
                      </Routes>
                    </RequireRole>
                  }
                />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
