import React, { createContext, useContext, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from '@mui/material';
import { useLanguage } from './useLanguage';

interface NavigationGuardContextValue {
  setDirty: (dirty: boolean) => void;
  guardedNavigate: (to: string) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  setDirty: () => {},
  guardedNavigate: () => {},
});

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [dirty, setDirtyState] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const setDirty = useCallback((v: boolean) => setDirtyState(v), []);

  const guardedNavigate = useCallback(
    (to: string) => {
      if (dirty) {
        setPending(to);
      } else {
        navigate(to);
      }
    },
    [dirty, navigate],
  );

  const handleLeave = () => {
    const to = pending!;
    setDirtyState(false);
    setPending(null);
    navigate(to);
  };

  const handleStay = () => setPending(null);

  return (
    <NavigationGuardContext.Provider value={{ setDirty, guardedNavigate }}>
      {children}
      <Dialog open={pending !== null} maxWidth="xs" fullWidth>
        <DialogTitle>{t('nav_unsavedTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('nav_unsavedChanges')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleStay}>{t('nav_stay')}</Button>
          <Button onClick={handleLeave} color="warning" variant="contained">
            {t('nav_leave')}
          </Button>
        </DialogActions>
      </Dialog>
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(): NavigationGuardContextValue {
  return useContext(NavigationGuardContext);
}
