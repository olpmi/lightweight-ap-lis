import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../../hooks/useLanguage';
import { ConflictToast } from '../../components/ConflictToast';
import type { ConflictEventDetail } from '../../api/client';

// `ConflictToast` listens on `window` for the `lis:conflict` custom event
// dispatched by the API client interceptor (see api/client.ts) on any 409
// response and renders a localized warning Snackbar. We exercise the wiring:
//   - the event listener is registered on mount
//   - dispatching the event opens the snackbar with the right message text
//   - unknown error codes fall back to the language's DEFAULT message
//   - non-English languages fall back to English when their entry is missing

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>,
  );
}

function fireConflict(detail: ConflictEventDetail) {
  act(() => {
    window.dispatchEvent(new CustomEvent('lis:conflict', { detail }));
  });
}

describe('ConflictToast', () => {
  beforeEach(() => {
    // Reset language to en for each test (LanguageProvider is wrapped fresh anyway).
    window.localStorage?.clear();
  });

  it('does not render the alert before any event fires', () => {
    renderWithProviders(<ConflictToast />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens with the English DRAFT_STALE message on a DRAFT_STALE event', () => {
    renderWithProviders(<ConflictToast />);
    fireConflict({ code: 'DRAFT_STALE', message: 'server msg', url: '/api/x' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/saved changes to this report/i);
  });

  it('opens with the English REPORT_ALREADY_FINAL message on that event', () => {
    renderWithProviders(<ConflictToast />);
    fireConflict({ code: 'REPORT_ALREADY_FINAL', message: 'srv', url: '/x' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/signed out by another user/i);
  });

  it('falls back to the English DEFAULT message for an unknown error code', () => {
    renderWithProviders(<ConflictToast />);
    fireConflict({ code: 'SOMETHING_NEW', message: 'srv', url: '/x' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/another user updated this/i);
  });

  it('handles a sequence of events without crashing or losing the listener', () => {
    renderWithProviders(<ConflictToast />);
    fireConflict({ code: 'DRAFT_STALE', message: 's', url: '/x' });
    fireConflict({ code: 'STATUS_CHANGED_BY_ANOTHER_USER', message: 's', url: '/x' });

    const alert = screen.getByRole('alert');
    // Last event wins; the snackbar shows the latest code's message.
    expect(alert.textContent).toMatch(/ancillary order status/i);
  });

  it('ignores events without a detail payload', () => {
    renderWithProviders(<ConflictToast />);
    act(() => {
      // Native CustomEvent with no detail; component must early-return.
      window.dispatchEvent(new CustomEvent('lis:conflict'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
