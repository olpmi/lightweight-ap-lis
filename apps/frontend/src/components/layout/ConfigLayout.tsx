import React from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

interface ConfigLayoutProps {
  children: React.ReactNode;
}

type LabelKey = Parameters<ReturnType<typeof useLanguage>['t']>[0];

/**
 * Tab order. A table rather than the nested ternary this replaced: the old
 * shape encoded each tab's index in two places (path -> index and index ->
 * path), so adding one meant editing both and keeping them in step.
 */
const CONFIG_TABS: ReadonlyArray<{ path: string; labelKey: LabelKey }> = [
  { path: '/config/templates', labelKey: 'cfg_tabTemplates' },
  { path: '/config/reports', labelKey: 'cfg_tabReports' },
  { path: '/config/ancillary', labelKey: 'cfg_tabAncillary' },
  { path: '/config/patient-summaries', labelKey: 'cfg_tabPatientSummaries' },
  { path: '/config/data-import', labelKey: 'cfg_tabDataImport' },
];

export default function ConfigLayout({ children }: ConfigLayoutProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Templates is the landing tab, so an unmatched path falls back to it.
  const matched = CONFIG_TABS.findIndex((tab) => location.pathname.startsWith(tab.path));
  const activeTab = matched === -1 ? 0 : matched;

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    navigate(CONFIG_TABS[newValue].path);
  };

  return (
    <Box display="flex" flexDirection="column" height="calc(100vh - 64px)" overflow="hidden">
      <Box borderBottom={1} borderColor="divider" flexShrink={0}>
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ px: 2 }}>
          {CONFIG_TABS.map((tab) => (
            <Tab key={tab.path} label={t(tab.labelKey)} />
          ))}
        </Tabs>
      </Box>
      <Box flex={1} minHeight={0} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}
