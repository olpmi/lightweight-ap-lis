// Shared type aliases for resultCase tab subcomponents.
// Keep these minimal — we only need a structural shape for the i18n function
// that matches what `useLanguage().t` returns without re-importing the union of
// translation keys (the components only pass keys that already exist).
export type TranslationFn = (key: string) => string;
