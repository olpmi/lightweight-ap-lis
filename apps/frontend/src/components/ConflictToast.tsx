import { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../hooks/useLanguage';
import type { ConflictEventDetail } from '../api/client';

// Self-contained translation map for conflict messages so we don't have to
// extend the central typed Translations dict (which requires all 5 languages
// touched per key). The default fallback covers any unknown server code.
type ConflictLang = 'en' | 'sw' | 'fr' | 'ar' | 'ur';

const CONFLICT_MESSAGES: Record<ConflictLang, Record<string, string>> = {
  en: {
    DEFAULT: 'Another user updated this — the page has been refreshed.',
    DRAFT_STALE: 'Another user saved changes to this report while you were editing. Your changes were not saved — the page has been refreshed with the latest version.',
    REPORT_ALREADY_FINAL: 'This report was just signed out by another user. The page has been refreshed.',
    REPORT_ALREADY_SIGNED: 'This report was just signed by another user. The page has been refreshed.',
    DRAFT_VERSION_CONFLICT: 'Another user created a new draft for this case. The page has been refreshed.',
    ORDER_ALREADY_REACTIVATED: 'This case was just reactivated by another user. The page has been refreshed.',
    STATUS_CHANGED_BY_ANOTHER_USER: 'The ancillary order status was changed by another user. The page has been refreshed.',
  },
  sw: {
    DEFAULT: 'Mtumiaji mwingine alibadilisha hii — ukurasa umesasishwa.',
  },
  fr: {
    DEFAULT: 'Un autre utilisateur a modifié cet élément — la page a été actualisée.',
    DRAFT_STALE: 'Un autre utilisateur a enregistré des modifications sur ce rapport pendant votre édition. Vos modifications n’ont pas été enregistrées — la page a été actualisée avec la dernière version.',
    REPORT_ALREADY_FINAL: 'Ce rapport vient d’être signé par un autre utilisateur. La page a été actualisée.',
    REPORT_ALREADY_SIGNED: 'Ce rapport vient d’être signé par un autre utilisateur. La page a été actualisée.',
    DRAFT_VERSION_CONFLICT: 'Un autre utilisateur a créé un nouveau brouillon pour ce cas. La page a été actualisée.',
    ORDER_ALREADY_REACTIVATED: 'Ce cas vient d’être réactivé par un autre utilisateur. La page a été actualisée.',
    STATUS_CHANGED_BY_ANOTHER_USER: 'Le statut de la commande auxiliaire a été modifié par un autre utilisateur. La page a été actualisée.',
  },
  ar: {
    DEFAULT: 'قام مستخدم آخر بتحديث هذا — تم تحديث الصفحة.',
  },
  ur: {
    DEFAULT: 'ایک اور صارف نے یہ تبدیل کر دیا ہے — صفحہ ریفریش ہو گیا ہے۔',
  },
};

function pickMessage(lang: ConflictLang, code: string): string {
  const langMap = CONFLICT_MESSAGES[lang] ?? CONFLICT_MESSAGES.en;
  return langMap[code] ?? langMap.DEFAULT ?? CONFLICT_MESSAGES.en.DEFAULT;
}

export function ConflictToast(): JSX.Element {
  const queryClient = useQueryClient();
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    function handleConflict(ev: Event) {
      const detail = (ev as CustomEvent<ConflictEventDetail>).detail;
      if (!detail) return;
      const text = pickMessage(lang as ConflictLang, detail.code);
      setMessage(text);
      setOpen(true);
      // Broad invalidation: simpler than parsing detail.url back to query keys,
      // and acceptable at this app's scale. Revisit once qk.* covers more keys.
      void queryClient.invalidateQueries();
    }

    window.addEventListener('lis:conflict', handleConflict);
    return () => window.removeEventListener('lis:conflict', handleConflict);
  }, [lang, queryClient]);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="warning" variant="filled" onClose={() => setOpen(false)}>
        {message}
      </Alert>
    </Snackbar>
  );
}
