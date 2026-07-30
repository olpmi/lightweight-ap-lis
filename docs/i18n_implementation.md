# Internationalization (i18n) Implementation

## Overview

The AP LIS frontend supports six languages via a custom React context — no third-party i18n library is required:

| Code | Language | Direction |
| --- | --- | --- |
| `en` | English | left-to-right |
| `sw` | Kiswahili | left-to-right |
| `fr` | French | left-to-right |
| `pt` | Portuguese | left-to-right |
| `ar` | Arabic | **right-to-left** |
| `ur` | Urdu | **right-to-left** |

The canonical list is `APP_LANGUAGE_CODES` in `packages/shared/src/templates/index.ts`. `LanguageProvider` sets `document.documentElement.lang` and `dir` from the selected language, so Arabic and Urdu render right-to-left.

Coverage is verified by `apps/frontend/src/tests/components/LanguageProvider.test.tsx` and by the `Interface languages` block in `apps/frontend/src/tests/e2e/workflows.spec.ts`.

## Architecture

### `apps/frontend/src/hooks/useLanguage.tsx`

Single source of truth for all UI strings. Key exports:

| Export | Type | Purpose |
|--------|------|---------|
| `LanguageProvider` | React component | Wraps the app; reads/writes `localStorage` |
| `useLanguage()` | Hook | Returns `{ t, tSite, tOrgan, lang, setLang }` |

#### Translation dictionaries

```ts
const en = { ... } as const          // English strings (literal types)
const sw: Record<keyof typeof en, string> = { ... }  // Kiswahili equivalents
```

Both dictionaries share the same flat key set (~300 keys). `en` uses `as const` for strict type inference; `sw` uses `Record<keyof typeof en, string>` to allow different string values.

#### Helper functions

- **`t(key)`** — returns the translated string for any UI label
- **`tSite(englishName)`** — translates a biopsy/cytology site name fetched from the DB
- **`tOrgan(englishName)`** — translates an organ/sub-site name fetched from the DB

`tSite` and `tOrgan` use lookup maps (`SITE_KEY_MAP`, `ORGAN_KEY_MAP`) so database values (English) are preserved while display strings are translated.

#### Persistence

Language preference is stored in `localStorage` under key `ap_lis_lang`. Defaults to `'en'`.

## Translation Key Namespaces

| Prefix | Page / Scope |
|--------|-------------|
| `appName`, `appFull` | App title |
| `nav_*` | Navigation sidebar labels |
| `common_*` | Shared cross-page strings (e.g., `common_delete`, `common_cancel`) |
| `login_*` | Login page |
| `dash_*` | Dashboard page |
| `pq_*` | Processing Queue page |
| `rq_*` | Result Queue page |
| `q_*` | Query page |
| `oe_*` | Order Entry page |
| `pc_*` | Processing Case page |
| `rc_*` | Result Case page |
| `site_*` | Biopsy/cytology site names |
| `organ_*` | Organ and sub-site names |

## Language Switcher

Located in the AppBar (`AppShell.tsx`) using a MUI `ToggleButtonGroup`:

```tsx
<ToggleButtonGroup value={lang} exclusive onChange={(_, v) => v && setLang(v)}>
  <ToggleButton value="en">EN</ToggleButton>
  <ToggleButton value="sw">SW</ToggleButton>
</ToggleButtonGroup>
```

Switching language instantly re-renders all translated strings via React context.

## Files Modified

| File | Change |
|------|--------|
| `hooks/useLanguage.tsx` | **New** — full translation context |
| `main.tsx` | Wrapped `<App />` with `<LanguageProvider>` |
| `components/layout/AppShell.tsx` | EN/SW toggle; `NAV_ITEMS` moved inside component |
| `pages/LoginPage.tsx` | All strings replaced with `t()` calls |
| `pages/DashboardPage.tsx` | `SECTIONS` array moved inside component |
| `pages/ProcessingQueuePage.tsx` | Table headers and status strings |
| `pages/ResultQueuePage.tsx` | All strings translated |
| `pages/QueryPage.tsx` | All strings translated |
| `pages/OrderEntryPage.tsx` | `tSite()`, `tOrgan()`, sex/case-type dropdowns |
| `pages/ProcessingCasePage.tsx` | All strings including block/slide UI |
| `pages/ResultCasePage.tsx` | `PANEL_LABELS` moved inside component; all dialogs, tabs, chips |

## Adding New Strings

1. Add the key to `en` in `useLanguage.tsx`
2. Add the same key with a Kiswahili value to `sw`
3. Use `const { t } = useLanguage()` and call `t('your_key')` in the component

## Notes

- Database-stored values (site names, organ names, case types, sex) remain in English to avoid breaking existing records. Only their **display** is translated.
- The `PANEL_LABELS`, `NAV_ITEMS`, and `SECTIONS` constant arrays were moved inside their respective components so they can call `t()` reactively.
- Docker builds require `DOCKER_BUILDKIT=0` on Windows due to a Junction symlink in `node_modules/@lis/shared`. The `.dockerignore` file excludes `node_modules` from the build context.
