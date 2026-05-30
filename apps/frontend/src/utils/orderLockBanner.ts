// Inline translation for the order edit-lock banner. Kept outside the strictly
// typed `t()` dictionary because adding a key forces updates across all five
// language files just for one banner.
export function formatLockedBanner(lang: string, name: string | null | undefined): string {
  const who = name && name.trim().length > 0 ? name : 'Another user';
  switch (lang) {
    case 'fr':
      return `${who} est en train de modifier ce dossier. La page est en lecture seule jusqu'à ce qu'il termine.`;
    default:
      return `${who} is editing this case. The page is read-only until they finish.`;
  }
}
