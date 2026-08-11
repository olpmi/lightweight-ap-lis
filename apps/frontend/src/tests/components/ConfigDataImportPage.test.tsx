import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import type { ImportPreview } from '@lis/shared';
import { theme } from '../../theme/theme';
import { LanguageProvider } from '../../hooks/useLanguage';
import ConfigDataImportPage from '../../pages/ConfigDataImportPage';
import * as api from '../../api';

vi.mock('../../api', () => ({
  dataImportApi: {
    preview: vi.fn(),
    commit: vi.fn(),
  },
}));

function preview(over: Partial<ImportPreview> = {}): ImportPreview {
  return {
    entity: 'patients',
    columns: {
      expected: ['patient_id', 'last_name', 'first_name', 'date_of_birth', 'sex'],
      required: ['last_name', 'first_name', 'date_of_birth'],
      found: ['patient_id', 'last_name', 'first_name', 'date_of_birth', 'sex'],
    },
    counts: { total: 1, create: 1, skip: 0, error: 0 },
    rows: [{ line: 2, row: 1, action: 'create', label: 'Mwangi, Grace' }],
    errors: [],
    truncated: false,
    canCommit: true,
    ...over,
  };
}

const withErrors = preview({
  counts: { total: 2, create: 1, skip: 0, error: 1 },
  errors: [
    {
      line: 7,
      row: 6,
      column: 'date_of_birth',
      code: 'INVALID_VALUE',
      message: 'date_of_birth must be formatted YYYY-MM-DD',
      value: '05/01/2001',
    },
  ],
  canCommit: false,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <LanguageProvider>
          <MemoryRouter>
            <ConfigDataImportPage />
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/**
 * jsdom's File lacks .text() in this environment, so provide it — the page
 * reads the picked file that way before posting it as a text/csv body.
 */
function csvFile(contents: string, name = 'roster.csv'): File {
  const file = new File([contents], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(contents) });
  return file;
}

async function pickFile(contents: string): Promise<void> {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [csvFile(contents)], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByText('roster.csv')).toBeInTheDocument());
}

const VALID_CSV = 'last_name,first_name,date_of_birth\nMwangi,Grace,1984-03-17';

beforeEach(() => {
  vi.mocked(api.dataImportApi.preview).mockReset();
  vi.mocked(api.dataImportApi.commit).mockReset();
});

describe('ConfigDataImportPage', () => {
  it('offers all three entity types and lists the expected columns', () => {
    renderPage();
    expect(screen.getByTestId('import-entity-patients')).toBeInTheDocument();
    expect(screen.getByTestId('import-entity-doctors')).toBeInTheDocument();
    expect(screen.getByTestId('import-entity-staff')).toBeInTheDocument();
    expect(screen.getByText('date_of_birth')).toBeInTheDocument();
  });

  it('keeps Validate disabled until a file is chosen', async () => {
    renderPage();
    expect(screen.getByTestId('import-validate')).toBeDisabled();
    await pickFile(VALID_CSV);
    expect(screen.getByTestId('import-validate')).toBeEnabled();
  });

  it('sends the file text for the selected entity', async () => {
    vi.mocked(api.dataImportApi.preview).mockResolvedValue(preview());
    renderPage();
    await pickFile(VALID_CSV);
    fireEvent.click(screen.getByTestId('import-validate'));

    await waitFor(() => {
      expect(api.dataImportApi.preview).toHaveBeenCalledWith('patients', VALID_CSV);
    });
  });

  it('shows each error with the file line the user can find in a spreadsheet', async () => {
    vi.mocked(api.dataImportApi.preview).mockResolvedValue(withErrors);
    renderPage();
    await pickFile(VALID_CSV);
    fireEvent.click(screen.getByTestId('import-validate'));

    await waitFor(() => {
      expect(screen.getByText(/must be formatted YYYY-MM-DD/)).toBeInTheDocument();
    });
    expect(screen.getByText('05/01/2001')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('blocks the import while any row is in error', async () => {
    vi.mocked(api.dataImportApi.preview).mockResolvedValue(withErrors);
    renderPage();
    await pickFile(VALID_CSV);
    fireEvent.click(screen.getByTestId('import-validate'));

    await waitFor(() => expect(screen.getByTestId('import-commit')).toBeInTheDocument());
    expect(screen.getByTestId('import-commit')).toBeDisabled();
  });

  it('commits a clean file and reports what it did', async () => {
    vi.mocked(api.dataImportApi.preview).mockResolvedValue(preview());
    vi.mocked(api.dataImportApi.commit).mockResolvedValue({
      ...preview(),
      created: 1,
      skipped: 0,
    });
    renderPage();
    await pickFile(VALID_CSV);
    fireEvent.click(screen.getByTestId('import-validate'));

    await waitFor(() => expect(screen.getByTestId('import-commit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('import-commit'));

    await waitFor(() => expect(screen.getByTestId('import-result')).toBeInTheDocument());
    expect(api.dataImportApi.commit).toHaveBeenCalledWith('patients', VALID_CSV);
  });

  it('discards a previous report when the entity changes', async () => {
    // Otherwise a user could validate a patients file, switch to staff, and
    // commit on the strength of the first file's green tick.
    vi.mocked(api.dataImportApi.preview).mockResolvedValue(preview());
    renderPage();
    await pickFile(VALID_CSV);
    fireEvent.click(screen.getByTestId('import-validate'));
    await waitFor(() => expect(screen.getByTestId('import-commit')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('import-entity-staff'));

    expect(screen.queryByTestId('import-commit')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-validate')).toBeDisabled();
  });
});
