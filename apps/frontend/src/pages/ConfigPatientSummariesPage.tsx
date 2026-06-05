import React, { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import ConfigLayout from '../components/layout/ConfigLayout';
import { lookupApi } from '../api';
import { qk } from '../api/queryKeys';
import { useLanguage } from '../hooks/useLanguage';
import type {
  PatientSummaryCatalogEntry,
  PatientSummaryDefinition,
  PatientSummaryLanguageCode,
  ResolvedPatientSummary,
} from '@lis/shared';

export default function ConfigPatientSummariesPage() {
  const { t } = useLanguage();
  const [psLang, setPsLang] = useState<PatientSummaryLanguageCode>('en');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<ResolvedPatientSummary | null | 'idle'>('idle');

  const { data: catalog = [], isLoading: catalogLoading } = useQuery<PatientSummaryCatalogEntry[]>({
    queryKey: qk.patientSummaryCatalog(psLang),
    queryFn: () => lookupApi.patientSummaryCatalog(psLang),
  });

  const { data: definition, isLoading: defLoading } = useQuery<PatientSummaryDefinition>({
    queryKey: qk.patientSummaryDefinition(selectedTemplateId ?? '', psLang),
    queryFn: () => lookupApi.patientSummaryDefinition(selectedTemplateId!, psLang),
    enabled: Boolean(selectedTemplateId),
  });

  const resolveMutation = useMutation({
    mutationFn: () =>
      lookupApi.patientSummaryResolve(selectedTemplateId!, psLang, testValues),
    onSuccess: (result) => setTestResult(result),
  });

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setTestValues({});
    setTestResult('idle');
  };

  const handleLanguageToggle = (lang: PatientSummaryLanguageCode) => {
    setPsLang(lang);
    setTestResult('idle');
  };

  const handleTestValueChange = (fieldId: string, value: string) => {
    setTestValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  return (
    <ConfigLayout>
      <Box display="flex" height="100%" overflow="hidden">
        {/* Left: catalog list */}
        <Box
          width={300}
          flexShrink={0}
          borderRight={1}
          borderColor="divider"
          overflow="auto"
          display="flex"
          flexDirection="column"
        >
          <Box display="flex" gap={1} px={1.5} py={1.5} borderBottom={1} borderColor="divider" flexShrink={0}>
            <Button
              size="small"
              variant={psLang === 'en' ? 'contained' : 'outlined'}
              onClick={() => handleLanguageToggle('en')}
            >
              EN
            </Button>
            <Button
              size="small"
              variant={psLang === 'sw' ? 'contained' : 'outlined'}
              onClick={() => handleLanguageToggle('sw')}
            >
              SW
            </Button>
          </Box>
          <Box flex={1} overflow="auto">
            {catalogLoading ? (
              <Box display="flex" justifyContent="center" py={3}>
                <CircularProgress size={20} />
              </Box>
            ) : (
              <List dense disablePadding>
                {catalog.map((entry) => (
                  <ListItemButton
                    key={entry.templateId}
                    selected={selectedTemplateId === entry.templateId}
                    onClick={() => handleSelectTemplate(entry.templateId)}
                    sx={{ alignItems: 'flex-start', py: 1.5 }}
                  >
                    <ListItemText
                      primary={entry.system}
                      secondary={
                        <Box component="span" display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
                          <Chip
                            label={entry.templateId}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.62rem', height: 18 }}
                          />
                          {entry.availableLanguages.map((l) => (
                            <Chip
                              key={l}
                              label={l.toUpperCase()}
                              size="small"
                              color={l === psLang ? 'primary' : 'default'}
                              sx={{ height: 18 }}
                            />
                          ))}
                        </Box>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </Box>

        {/* Right: template details + test panel */}
        <Box flex={1} overflow="auto" p={2}>
          {!selectedTemplateId ? (
            <Typography color="text.secondary" sx={{ mt: 6, textAlign: 'center' }}>
              {t('ps_adminSelectTemplate')}
            </Typography>
          ) : defLoading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : definition ? (
            <Stack spacing={2.5}>
              {/* Overview */}
              <Box>
                <Typography variant="h6">{definition.system}</Typography>
                <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap">
                  <Chip label={definition.templateId} size="small" variant="outlined" />
                  {definition.availableLanguages.map((l) => (
                    <Chip
                      key={l}
                      label={l.toUpperCase()}
                      size="small"
                      color={l === psLang ? 'primary' : 'default'}
                    />
                  ))}
                </Stack>
                <Stack direction="row" spacing={3} mt={1}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>{t('ps_adminTriggerFields')}: </strong>
                    {definition.triggerFields.join(', ')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>{t('ps_adminRuleCount')}: </strong>
                    {definition.rules.length}
                  </Typography>
                </Stack>
              </Box>

              <Divider />

              {/* Test panel */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>{t('ps_adminTestMatch')}</Typography>
                <Stack spacing={1.5}>
                  {definition.triggerFields.map((fieldId) => (
                    <TextField
                      key={fieldId}
                      size="small"
                      label={fieldId}
                      value={testValues[fieldId] ?? ''}
                      onChange={(e) => handleTestValueChange(fieldId, e.target.value)}
                      placeholder={t('ps_adminTestValues')}
                    />
                  ))}
                  <Box>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setTestResult('idle');
                        resolveMutation.mutate();
                      }}
                      disabled={resolveMutation.isPending}
                    >
                      {t('ps_adminTestMatch')}
                    </Button>
                  </Box>
                  {testResult !== 'idle' && (
                    testResult ? (
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="overline" color="primary.main" display="block">
                          {testResult.professionalLabel}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {testResult.patientTitle}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {testResult.plainLanguageSummary}
                        </Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2">
                          <strong>{t('ps_whatThisMeans')}: </strong>
                          {testResult.whatThisMeans}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          <strong>{t('ps_possibleNextSteps')}: </strong>
                          {testResult.possibleNextSteps}
                        </Typography>
                        <Alert severity="info" sx={{ mt: 1 }}>{testResult.safetyNote}</Alert>
                      </Paper>
                    ) : (
                      <Alert severity="warning">{t('ps_adminNoMatch')}</Alert>
                    )
                  )}
                </Stack>
              </Box>

              <Divider />

              {/* Rules accordion */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>{t('ps_adminRules')}</Typography>
                {definition.rules.map((rule) => (
                  <Accordion
                    key={rule.ruleId}
                    disableGutters
                    elevation={0}
                    sx={{ border: 1, borderColor: 'divider', mb: 0.5, '&:before': { display: 'none' } }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Stack>
                        <Typography variant="body2" fontWeight={600}>{rule.professionalLabel}</Typography>
                        <Typography variant="caption" color="text.secondary">{rule.ruleId}</Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box mb={1.5}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                          {t('ps_adminMatchCriteria')}
                        </Typography>
                        {Object.entries(rule.match).map(([field, criteria]) => (
                          <Typography key={field} variant="body2" sx={{ ml: 1 }}>
                            <strong>{field}:</strong>{' '}
                            {criteria.equals.length > 0 && `= [${criteria.equals.join(', ')}]`}
                            {criteria.equals.length > 0 && criteria.includes.length > 0 && ' '}
                            {criteria.includes.length > 0 && `⊇ [${criteria.includes.join(', ')}]`}
                          </Typography>
                        ))}
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        <strong>{t('ps_title')}: </strong>{rule.patientTitle}
                      </Typography>
                      <Typography variant="body2">{rule.plainLanguageSummary}</Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            </Stack>
          ) : null}
        </Box>
      </Box>
    </ConfigLayout>
  );
}
