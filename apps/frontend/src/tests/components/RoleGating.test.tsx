/**
 * Role-driven UI gating.
 *
 * Deliberately targets surfaces where the role is the *only* input. The sign-out
 * button, for instance, is also gated on workflow state (diagnosis and gross
 * filled, every block slid and distributed), so asserting it is disabled for a
 * technologist would pass even if the role check were deleted. The navigation
 * entry and the route guard have no such confound.
 *
 * The server is the enforcement — see the backend's authorization integration
 * suite. This covers only that a user is not shown a control that would be
 * refused.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { EMPLOYEE_ROLES, type EmployeeRoleName } from '@lis/shared';
import { theme } from '../../theme/theme';
import { LanguageProvider } from '../../hooks/useLanguage';
import AppShell from '../../components/layout/AppShell';

// `vi.mock` factories are hoisted and run once, so the role has to be reached
// through a binding rather than captured.
let mockRole: EmployeeRoleName = EMPLOYEE_ROLES.PATHOLOGIST;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { employeeId: 1, userName: 'tester', role: mockRole, defaultLanguage: 'en' },
    loading: false,
    hasRole: (...roles: EmployeeRoleName[]) => roles.includes(mockRole),
    isPathologist: mockRole === EMPLOYEE_ROLES.PATHOLOGIST,
    isAdministrator: mockRole === EMPLOYEE_ROLES.ADMINISTRATOR,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../hooks/useNavigationGuard', () => ({
  useNavigationGuard: () => ({ setDirty: vi.fn(), guardedNavigate: vi.fn() }),
}));

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => false,
  useBootstrapAvailable: () => false,
}));

vi.mock('../../api', () => ({
  employeeApi: { updateLanguage: vi.fn().mockResolvedValue(undefined) },
}));

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <LanguageProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppShell>
              <div />
            </AppShell>
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockRole = EMPLOYEE_ROLES.PATHOLOGIST;
});

describe('configuration navigation', () => {
  it('shows Config to an administrator', () => {
    mockRole = EMPLOYEE_ROLES.ADMINISTRATOR;
    renderShell();
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('hides Config from a pathologist', () => {
    // /api/config/* is Administrator-only, roster import included.
    renderShell();
    expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
  });

  it('hides Config from a technologist', () => {
    mockRole = EMPLOYEE_ROLES.TECHNOLOGIST;
    renderShell();
    expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
  });

  it('still shows the clinical worklists to every role', () => {
    // Gating must not narrow ordinary work.
    for (const role of [EMPLOYEE_ROLES.PATHOLOGIST, EMPLOYEE_ROLES.TECHNOLOGIST] as EmployeeRoleName[]) {
      mockRole = role;
      const { unmount } = renderShell();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Histology')).toBeInTheDocument();
      unmount();
    }
  });
});
