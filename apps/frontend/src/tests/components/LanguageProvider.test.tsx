/**
 * Language and text-direction tests.
 *
 * The manuscript claims interfaces in six languages, two of which are
 * right-to-left. Before this file the only `dir="rtl"` assertions lived in
 * Playwright specs gated behind RUN_DEMO / RUN_I18N_AUDIT, so neither the
 * language count nor RTL handling was verified by anything that runs in CI.
 *
 * These tests exercise every code in APP_LANGUAGE_CODES rather than a
 * hand-maintained list, so adding a seventh language without a dictionary
 * fails here instead of shipping.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { APP_LANGUAGE_CODES, type AppLanguageCode } from '@lis/shared';
import { LanguageProvider, useLanguage, LANGUAGE_OPTIONS } from '../../hooks/useLanguage';

const RTL_LANGUAGES: AppLanguageCode[] = ['ar', 'ur'];

/** Renders the current language state and exposes a setter for switching. */
function LanguageProbe() {
  const { lang, direction, t, setLang } = useLanguage();

  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="direction">{direction}</span>
      <span data-testid="sample">{t('nav_home')}</span>
      {LANGUAGE_OPTIONS.map((option) => (
        <button key={option.code} data-testid={`set-${option.code}`} onClick={() => setLang(option.code)}>
          {option.shortLabel}
        </button>
      ))}
    </div>
  );
}

function renderWithLanguage(initial?: AppLanguageCode) {
  if (initial) localStorage.setItem('ap_lis_lang', initial);
  return render(
    <LanguageProvider>
      <LanguageProbe />
    </LanguageProvider>
  );
}

describe('language coverage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('declares exactly six supported languages', () => {
    expect(APP_LANGUAGE_CODES).toHaveLength(6);
    expect([...APP_LANGUAGE_CODES].sort()).toEqual(['ar', 'en', 'fr', 'pt', 'sw', 'ur']);
  });

  it('exposes a language option for every supported code', () => {
    const optionCodes = LANGUAGE_OPTIONS.map((option) => option.code).sort();
    expect(optionCodes).toEqual([...APP_LANGUAGE_CODES].sort());
  });

  it.each(APP_LANGUAGE_CODES)('resolves translated text in %s', (code) => {
    renderWithLanguage(code);

    expect(screen.getByTestId('lang')).toHaveTextContent(code);

    // A resolved key must not fall through to the raw key name.
    const sample = screen.getByTestId('sample').textContent ?? '';
    expect(sample.length).toBeGreaterThan(0);
    expect(sample).not.toBe('nav_home');
  });

  it('translates the same key differently across languages', () => {
    const rendered = new Map<AppLanguageCode, string>();

    for (const code of APP_LANGUAGE_CODES) {
      const view = renderWithLanguage(code);
      rendered.set(code, screen.getByTestId('sample').textContent ?? '');
      view.unmount();
      localStorage.clear();
    }

    // Not every language necessarily differs on one key, but a six-language UI
    // that renders one identical string everywhere is not translated at all.
    expect(new Set(rendered.values()).size).toBeGreaterThan(1);
  });
});

describe('text direction', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it.each(APP_LANGUAGE_CODES)('sets document lang and dir for %s', (code) => {
    renderWithLanguage(code);

    const expectedDirection = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
    expect(screen.getByTestId('direction')).toHaveTextContent(expectedDirection);
    expect(document.documentElement.lang).toBe(code);
    expect(document.documentElement.dir).toBe(expectedDirection);
  });

  it('marks Arabic and Urdu as right-to-left and the rest as left-to-right', () => {
    for (const option of LANGUAGE_OPTIONS) {
      expect(option.direction).toBe(RTL_LANGUAGES.includes(option.code) ? 'rtl' : 'ltr');
    }
  });

  it('flips direction both ways when switching between scripts', async () => {
    renderWithLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');

    await act(async () => {
      screen.getByTestId('set-ar').click();
    });
    expect(screen.getByTestId('lang')).toHaveTextContent('ar');
    expect(document.documentElement.dir).toBe('rtl');

    // Switching between the two RTL languages must stay RTL.
    await act(async () => {
      screen.getByTestId('set-ur').click();
    });
    expect(document.documentElement.dir).toBe('rtl');

    // Returning to an LTR language must restore ltr, not leave the document stuck.
    await act(async () => {
      screen.getByTestId('set-pt').click();
    });
    expect(screen.getByTestId('lang')).toHaveTextContent('pt');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('persists the selected language across remounts', () => {
    const view = renderWithLanguage('en');
    act(() => {
      screen.getByTestId('set-ur').click();
    });
    view.unmount();

    renderWithLanguage();
    expect(screen.getByTestId('lang')).toHaveTextContent('ur');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('falls back to English when the stored language is not supported', () => {
    localStorage.setItem('ap_lis_lang', 'xx');
    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

/**
 * `tIn` exists so patient-facing text can be labelled in the patient's language
 * while the surrounding interface stays in the staff member's. Without it, a
 * Kiswahili patient summary rendered under English headings.
 */
describe('translating into an explicit language', () => {
  function ExplicitLanguageProbe() {
    const { t, tIn } = useLanguage();
    return (
      <div>
        <span data-testid="interface">{t('ps_whatThisMeans')}</span>
        {APP_LANGUAGE_CODES.map((code) => (
          <span key={code} data-testid={`explicit-${code}`}>
            {tIn(code, 'ps_whatThisMeans')}
          </span>
        ))}
      </div>
    );
  }

  it('is independent of the interface language', () => {
    localStorage.setItem('ap_lis_lang', 'en');
    render(
      <LanguageProvider>
        <ExplicitLanguageProbe />
      </LanguageProvider>
    );

    // The interface is English, but each requested language answers in itself.
    expect(screen.getByTestId('interface')).toHaveTextContent('What This Means');
    expect(screen.getByTestId('explicit-sw')).toHaveTextContent('Maana yake');
    expect(screen.getByTestId('explicit-fr')).toHaveTextContent('Ce que cela signifie');
  });

  it('returns a string for every supported language', () => {
    localStorage.setItem('ap_lis_lang', 'en');
    render(
      <LanguageProvider>
        <ExplicitLanguageProbe />
      </LanguageProvider>
    );

    for (const code of APP_LANGUAGE_CODES) {
      const rendered = screen.getByTestId(`explicit-${code}`).textContent ?? '';
      expect(rendered.trim(), `no patient-summary heading for ${code}`).not.toBe('');
      expect(rendered).not.toContain('undefined');
    }
  });
});
