import React from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

interface ConfigLayoutProps {
  children: React.ReactNode;
}

export default function ConfigLayout({ children }: ConfigLayoutProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = location.pathname.startsWith('/config/reports')
    ? 1
    : location.pathname.startsWith('/config/ancillary')
      ? 2
      : location.pathname.startsWith('/config/patient-summaries')
        ? 3
        : 0;

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    if (newValue === 0) navigate('/config/templates');
    else if (newValue === 1) navigate('/config/reports');
    else if (newValue === 2) navigate('/config/ancillary');
    else navigate('/config/patient-summaries');
  };

  return (
    <Box display="flex" flexDirection="column" height="calc(100vh - 64px)" overflow="hidden">
      <Box borderBottom={1} borderColor="divider" flexShrink={0}>
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ px: 2 }}>
          <Tab label={t('cfg_tabTemplates')} />
          <Tab label={t('cfg_tabReports')} />
          <Tab label={t('cfg_tabAncillary')} />
          <Tab label={t('cfg_tabPatientSummaries')} />
        </Tabs>
      </Box>
      <Box flex={1} minHeight={0} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}
