import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../theme/theme';
import { LanguageProvider } from '../../hooks/useLanguage';
import LoginPage from '../../pages/LoginPage';
import * as api from '../../api';

// Mock the API module
vi.mock('../../api', () => ({
  lookupApi: {
    employeeRoles: vi.fn().mockResolvedValue([
      { employeeRoleId: 1, roleName: 'Pathologist' },
      { employeeRoleId: 2, roleName: 'Technologist' },
    ]),
  },
  employeeApi: {
    search: vi.fn().mockResolvedValue([
      { employeeId: 1, firstName: 'Alice', lastName: 'Smith', userName: 'asmith', employeeRole: { roleName: 'Pathologist' } },
    ]),
  },
  authApi: {
    login: vi.fn().mockResolvedValue({ employeeId: 1, userName: 'asmith' }),
    me: vi.fn().mockResolvedValue({ employeeId: 1, userName: 'asmith', role: 'Pathologist' }),
    logout: vi.fn(),
  },
  // The page reads this to decide whether to show the demo-data notice.
  metaApi: {
    get: vi.fn().mockResolvedValue({ demoMode: false }),
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    loading: false,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <LanguageProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('LoginPage', () => {
  it('renders find employee and new employee tabs', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText(/Find employee/i)).toBeInTheDocument();
    expect(screen.getByText(/New employee/i)).toBeInTheDocument();
  });

  it('shows search input in find employee mode', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByTestId('employee-search-input')).toBeInTheDocument();
  });

  it('hides the demo-data notice when the deployment is not a demo', async () => {
    renderWithProviders(<LoginPage />);
    await waitFor(() => expect(api.metaApi.get).toHaveBeenCalled());
    expect(screen.queryByTestId('demo-mode-notice')).not.toBeInTheDocument();
  });

  it('shows the demo-data notice when the deployment is a demo', async () => {
    // This is the screen a demo audience sees first, and it renders outside
    // AppShell — so it needs its own notice rather than relying on the app bar.
    vi.mocked(api.metaApi.get).mockResolvedValueOnce({ demoMode: true });
    renderWithProviders(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByTestId('demo-mode-notice')).toBeInTheDocument();
    });
  });

  it('switches to new employee form', async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.click(screen.getByText(/New employee/i));
    await waitFor(() => {
      expect(screen.getByTestId('new-employee-firstname')).toBeInTheDocument();
    });
  });

  it('shows validation error when new employee form is incomplete', async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.click(screen.getByText(/New employee/i));
    const submitButton = await waitFor(() => screen.getByTestId('new-employee-submit'));
    fireEvent.submit(submitButton.closest('form') as HTMLFormElement);
    await waitFor(() => {
      expect(screen.getByText(/All fields are required/i)).toBeInTheDocument();
    });
  });
});
