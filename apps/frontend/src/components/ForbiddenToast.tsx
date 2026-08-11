import { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useLanguage } from '../hooks/useLanguage';
import type { ForbiddenEventDetail } from '../api/client';

/**
 * Global notice for a 403 from the API.
 *
 * The UI hides controls a role cannot use, so a 403 normally means a stale page —
 * someone's role changed mid-session, or a request was made directly. Without
 * this the rejection would surface only in whichever page-local `<Alert>` the
 * calling mutation happens to have, and several call sites have none.
 *
 * Unlike ConflictToast this uses the central typed dictionary rather than a local
 * message map: the wording is one generic sentence, so it costs one key across
 * the six locales and stays translated everywhere. The server's own message is
 * deliberately not shown — it is untranslated English.
 */
export function ForbiddenToast(): JSX.Element {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleForbidden(ev: Event) {
      const detail = (ev as CustomEvent<ForbiddenEventDetail>).detail;
      if (!detail) return;
      setOpen(true);
    }

    window.addEventListener('lis:forbidden', handleForbidden);
    return () => window.removeEventListener('lis:forbidden', handleForbidden);
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="warning" variant="filled" onClose={() => setOpen(false)} data-testid="forbidden-toast">
        {t('errorForbidden')}
      </Alert>
    </Snackbar>
  );
}
