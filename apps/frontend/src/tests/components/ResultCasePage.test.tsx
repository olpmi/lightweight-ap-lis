import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../theme/theme';
import { LanguageProvider } from '../../hooks/useLanguage';
import ResultCasePage from '../../pages/ResultCasePage';
import * as api from '../../api';

const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

vi.mock('../../api', () => {
  const enPatientSummary = {
    templateId: 'general_cytology',
    family: 'general_cytology',
    relativeDir: 'patient_summaries/general_cytology',
    language: 'en',
    availableLanguages: ['en', 'sw'],
    summaryType: 'rule_based_patient_facing_summary',
    system: 'General Cytology Reporting Template',
    triggerFields: ['diagnostic_category'],
    rules: [
      {
        ruleId: 'general_positive_for_malignancy',
        match: {
          diagnostic_category: {
            equals: ['Positive for malignancy'],
            includes: [],
          },
        },
        professionalLabel: 'Positive for malignancy',
        patientTitle: 'Cancer cells identified',
        plainLanguageSummary: 'The sample shows malignant cells, meaning cancer cells were identified.',
        whatThisMeans: 'This result usually requires further clinical evaluation and treatment planning.',
        possibleNextSteps: 'Your doctor may arrange biopsy, imaging, or specialist referral.',
        safetyNote: 'Discuss the full report with your doctor.',
      },
      {
        ruleId: 'general_negative_for_malignancy_benign',
        match: {
          diagnostic_category: {
            equals: ['Negative for malignancy'],
            includes: [],
          },
        },
        professionalLabel: 'Negative for malignancy',
        patientTitle: 'No cancer cells seen',
        plainLanguageSummary: 'The sample did not show cancer cells.',
        whatThisMeans: 'This is generally reassuring in the material examined.',
        possibleNextSteps: 'Your doctor may recommend follow-up based on the overall clinical picture.',
        safetyNote: 'Discuss the full report with your doctor.',
      },
    ],
  };

  const swPatientSummary = {
    ...enPatientSummary,
    language: 'sw',
    rules: [
      {
        ...enPatientSummary.rules[0],
        patientTitle: 'Seli za saratani zimeonekana',
        plainLanguageSummary: 'Sampuli inaonyesha seli za saratani.',
        whatThisMeans: 'Matokeo haya yanahitaji tathmini zaidi ya kliniki.',
        possibleNextSteps: 'Daktari wako anaweza kupanga biopsy, vipimo vya picha, au rufaa kwa mtaalamu.',
        safetyNote: 'Jadili ripoti kamili na daktari wako.',
      },
      {
        ...enPatientSummary.rules[1],
        patientTitle: 'Hakuna seli za saratani zilizoonekana',
        plainLanguageSummary: 'Sampuli haikuonyesha seli za saratani.',
        whatThisMeans: 'Hili kwa ujumla hutia moyo katika sampuli iliyochunguzwa.',
        possibleNextSteps: 'Daktari wako anaweza kupendekeza ufuatiliaji kulingana na hali ya kliniki kwa ujumla.',
        safetyNote: 'Jadili ripoti kamili na daktari wako.',
      },
    ],
  };

  const reportingTemplateCatalog = [
    {
      templateKey: 'general_cytology/general_cytology',
      templateId: 'general_cytology',
      family: 'general_cytology',
      kind: 'reporting',
      schemaStyle: 'flat',
      title: 'General Cytology',
      relativeDir: 'general_cytology',
      availableLanguages: ['en', 'sw'],
    },
  ];

  const reportingTemplateDefinition = {
    templateKey: 'general_cytology/general_cytology',
    templateId: 'general_cytology',
    family: 'general_cytology',
    kind: 'reporting',
    schemaStyle: 'flat',
    title: 'General Cytology',
    language: 'en',
    availableLanguages: ['en', 'sw'],
    core: {
      sections: [
        {
          id: 'diagnostic_category',
          title: 'Diagnostic Category',
          fields: [
            {
              id: 'diagnostic_category',
              label: 'Diagnostic Category',
              type: 'select',
              options: ['Positive for malignancy', 'Negative for malignancy'],
            },
          ],
        },
      ],
    },
    translation: null,
  };

  return {
    lookupApi: {
      templateCatalog: vi.fn().mockResolvedValue(reportingTemplateCatalog),
      templateDefinition: vi.fn().mockResolvedValue(reportingTemplateDefinition),
      patientSummaryDefinition: vi.fn().mockImplementation((_templateId: string, language?: string) => Promise.resolve(
        language === 'sw' ? swPatientSummary : enPatientSummary,
      )),
    },
    orderApi: {
      get: vi.fn().mockResolvedValue({
        orderId: 'SU250000001',
        registeredDate: '2026-05-05T00:00:00.000Z',
        clinicalHistory: 'Clinical history',
        isReactivated: false,
        patient: {
          patientId: 'P0000001',
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: '1980-01-01T00:00:00.000Z',
          sex: 'Female',
        },
        doctor: {
          firstName: 'Sam',
          lastName: 'Smith',
        },
      }),
      materials: vi.fn().mockResolvedValue({ data: { specimens: [] } }),
      updateClinicalHistory: vi.fn().mockResolvedValue({}),
    },
    reportApi: {
      list: vi.fn().mockResolvedValue([
        {
          reportId: 101,
          versionNumber: 1,
          diagnosis: '',
          comment: '',
          gross: '',
          grossPayload: '',
          synopticData: '',
          synopticPayload: JSON.stringify({
            version: 1,
            templateKey: 'general_cytology/general_cytology',
            templateId: 'general_cytology',
            title: 'General Cytology',
            kind: 'reporting',
            language: 'en',
            values: {
              'diagnostic_category.diagnostic_category': 'Positive for malignancy',
            },
          }),
          isFinal: false,
          isPrelim: false,
          reportTemplate: null,
          reportFiles: [],
        },
      ]),
      createDraft: vi.fn().mockResolvedValue({ reportId: 101 }),
      signOut: vi.fn(),
      signPrelim: vi.fn(),
      reactivate: vi.fn(),
      pdfUrl: vi.fn().mockReturnValue('/api/reports/101/pdf'),
      patientSummaryPdfUrl: vi.fn().mockImplementation((reportId: number, language: string) => `/api/reports/${reportId}/patient-summary.pdf?language=${language}`),
    },
  };
});

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { employeeId: 1 },
    loading: false,
  }),
}));

const setDirty = vi.fn();
const guardedNavigate = vi.fn();

vi.mock('../../hooks/useNavigationGuard', () => ({
  useNavigationGuard: () => ({
    setDirty,
    guardedNavigate,
  }),
}));

function renderWithProviders() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <LanguageProvider>
          <MemoryRouter initialEntries={['/result/SU250000001']}>
            <Routes>
              <Route path="/result/:orderId" element={<ResultCasePage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('ResultCasePage patient summary', () => {
  beforeEach(() => {
    setDirty.mockReset();
    guardedNavigate.mockReset();
    windowOpenSpy.mockClear();
    (api.reportApi.createDraft as unknown as ReturnType<typeof vi.fn>).mockClear();
    (api.reportApi.patientSummaryPdfUrl as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('renders a patient summary preview and switches preview language', async () => {
    renderWithProviders();

    const patientSummaryTab = await screen.findByRole('tab', { name: 'Patient Summary' });
    fireEvent.click(patientSummaryTab);

    expect(await screen.findByText('Cancer cells identified')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }));

    await waitFor(() => {
      expect(windowOpenSpy).toHaveBeenCalledWith(
        '/api/reports/101/patient-summary.pdf?language=en',
        '_blank',
        'noopener,noreferrer',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'SW' }));

    await waitFor(() => {
      expect(screen.getByText('Seli za saratani zimeonekana')).toBeInTheDocument();
    });

    expect((api.lookupApi.patientSummaryDefinition as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('general_cytology', 'sw');
  });

  it('saves the draft before opening the patient summary PDF when the structured report changed', async () => {
    (api.reportApi.createDraft as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ reportId: 202 });
    (api.reportApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        reportId: 101,
        versionNumber: 1,
        diagnosis: '',
        comment: '',
        gross: '',
        grossPayload: '',
        synopticData: '',
        synopticPayload: JSON.stringify({
          version: 1,
          templateKey: 'general_cytology/general_cytology',
          templateId: 'general_cytology',
          title: 'General Cytology',
          kind: 'reporting',
          language: 'sw',
          values: {
            'diagnostic_category.diagnostic_category': 'Positive for malignancy',
          },
        }),
        isFinal: false,
        isPrelim: false,
        reportTemplate: null,
        reportFiles: [],
      },
    ]);

    renderWithProviders();

    const patientSummaryTab = await screen.findByRole('tab', { name: 'Patient Summary' });
    fireEvent.click(patientSummaryTab);

    expect(await screen.findByText('Cancer cells identified')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }));

    await waitFor(() => {
      expect(api.reportApi.createDraft).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(windowOpenSpy).toHaveBeenCalledWith(
        '/api/reports/202/patient-summary.pdf?language=en',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('only shows the patient summary tab when a summary resolves', async () => {
    (api.reportApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        reportId: 101,
        versionNumber: 1,
        diagnosis: '',
        comment: '',
        gross: '',
        grossPayload: '',
        synopticData: '',
        synopticPayload: JSON.stringify({
          version: 1,
          templateKey: 'general_cytology/general_cytology',
          templateId: 'general_cytology',
          title: 'General Cytology',
          kind: 'reporting',
          language: 'en',
          values: {
            'diagnostic_category.diagnostic_category': 'Negative for malignancy',
          },
        }),
        isFinal: false,
        isPrelim: false,
        reportTemplate: null,
        reportFiles: [],
      },
    ]);

    renderWithProviders();

    await screen.findByRole('tab', { name: 'Result Entry' });

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Patient Summary' })).not.toBeInTheDocument();
    });
  });
});