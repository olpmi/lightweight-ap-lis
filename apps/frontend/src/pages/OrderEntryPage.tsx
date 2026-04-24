import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Stack,
  Chip,
  IconButton,
  Divider,
  Autocomplete,
  CircularProgress,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Add, Delete, Download } from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useBlocker } from 'react-router-dom';
import { orderApi, lookupApi, patientApi, doctorApi } from '../api';
import { formatOrderIdDisplay, BODY_SITE_HIERARCHY, CYTOLOGY_SITE_HIERARCHY } from '@lis/shared';
import { useLanguage } from '../hooks/useLanguage';
import { useNavigationGuard } from '../hooks/useNavigationGuard';

interface SpecimenRow {
  id: string;
  site: string;
  bodySiteId: number | '';
  specimenTypeId: number | '';
  coldIschemicTime: string;
}

export default function OrderEntryPage() {
  const { t, tSite, tOrgan, tSpecimenType } = useLanguage();
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing');
  const [doctorMode, setDoctorMode] = useState<'existing' | 'new'>('existing');
  const [patientSearch, setPatientSearch] = useState('');
  const [doctorSearch, setDoctorSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<object | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<object | null>(null);

  const [form, setForm] = useState({
    caseType: 'Surgical Pathology',
    patientLastName: '',
    patientFirstName: '',
    patientDateOfBirth: '',
    patientSex: '',
    doctorLastName: '',
    doctorFirstName: '',
  });

  const [specimens, setSpecimens] = useState<SpecimenRow[]>([{ id: '1', site: '', bodySiteId: '', specimenTypeId: '', coldIschemicTime: '' }]);
  const [createdOrder, setCreatedOrder] = useState<{ orderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  // Dirty when the user has entered data but not yet created the case
  const isDirty = !createdOrder && (
    selectedPatient !== null ||
    selectedDoctor !== null ||
    !!form.patientLastName || !!form.patientFirstName || !!form.patientDateOfBirth || !!form.patientSex ||
    !!form.doctorLastName || !!form.doctorFirstName ||
    specimens.some((s) => s.bodySiteId !== '' || s.specimenTypeId !== '')
  );

  const { setDirty } = useNavigationGuard();
  React.useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const { data: bodySites } = useQuery<object[]>({
    queryKey: ['body-sites'],
    queryFn: lookupApi.bodySites,
  });
  const { data: specimenTypes } = useQuery<object[]>({
    queryKey: ['specimen-types'],
    queryFn: lookupApi.specimenTypes,
  });

  const { data: patientResults, isFetching: searchingPatients } = useQuery<object[]>({
    queryKey: ['patient-search', patientSearch],
    queryFn: () => patientApi.search(patientSearch),
    enabled: true,
  });

  const { data: doctorResults, isFetching: searchingDoctors } = useQuery<object[]>({
    queryKey: ['doctor-search', doctorSearch],
    queryFn: () => doctorApi.search(doctorSearch),
    enabled: true,
  });

  const createMutation = useMutation({
    mutationFn: orderApi.create,
    onSuccess: (data) => {
      const order = data as { orderId: string };
      setCreatedOrder(order);
      setSuccessOpen(true);
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric')
      );
    },
  });

  const addSpecimen = () =>
    setSpecimens([...specimens, { id: String(Date.now()), site: '', bodySiteId: '', specimenTypeId: '', coldIschemicTime: '' }]);

  const removeSpecimen = (id: string) =>
    setSpecimens(specimens.filter((s) => s.id !== id));

  const updateSpecimen = (id: string, field: keyof SpecimenRow, value: number | string | '') =>
    setSpecimens(specimens.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  const handleSiteChange = (id: string, site: string) => {
    const isCyto = form.caseType === 'Cytology';
    const hierarchy = isCyto ? CYTOLOGY_SITE_HIERARCHY : BODY_SITE_HIERARCHY;
    const organs = hierarchy[site] ?? [];
    if (isCyto && organs.length === 0) {
      // Site with no sub-organs: auto-resolve bodySiteId from DB
      const match = (bodySites as Array<{ bodySiteId: number; bodySiteName: string }> ?? [])
        .find((s) => s.bodySiteName === site);
      setSpecimens(specimens.map((s) => s.id === id ? { ...s, site, bodySiteId: match?.bodySiteId ?? '' } : s));
    } else {
      setSpecimens(specimens.map((s) => s.id === id ? { ...s, site, bodySiteId: '' } : s));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {
      registeredDate: new Date().toISOString(),
      caseType: form.caseType,
      specimens: specimens.map((s) => ({
        bodySiteId: s.bodySiteId || undefined,
        specimenTypeId: s.specimenTypeId || undefined,
        coldIschemicTime: s.coldIschemicTime ? parseInt(s.coldIschemicTime) : undefined,
      })),
    };

    if (patientMode === 'existing' && selectedPatient) {
      payload.patientId = (selectedPatient as { patientId: string }).patientId;
    } else {
      payload.patientLastName = form.patientLastName;
      payload.patientFirstName = form.patientFirstName;
      payload.patientDateOfBirth = form.patientDateOfBirth;
      payload.patientSex = form.patientSex;
    }

    if (doctorMode === 'existing' && selectedDoctor) {
      payload.doctorId = Number((selectedDoctor as { doctorId: number | bigint }).doctorId);
    } else {
      payload.doctorLastName = form.doctorLastName;
      payload.doctorFirstName = form.doctorFirstName;
    }

    createMutation.mutate(payload);
  };

  return (
    <Box>
      <Typography variant="h5" mb={3} data-testid="page-title">
        {t('oe_title')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {createdOrder && (
        <Alert
          severity="success"
          sx={{ mb: 3 }}
          data-testid="order-success-alert"
          action={
            <Button
              href={orderApi.worksheetPdfUrl(createdOrder.orderId)}
              target="_blank"
              size="small"
              startIcon={<Download />}
            >
              {t('oe_worksheetPdf')}
            </Button>
          }
        >
          <Typography fontWeight={700} variant="h6" component="span">
            {t('oe_caseCreated')} {formatOrderIdDisplay(createdOrder.orderId)}
          </Typography>
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Patient section */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                {t('oe_patient')}
              </Typography>
              <Stack direction="row" spacing={1} mb={2}>
                <Chip
                  label={t('oe_existing')}
                  onClick={() => setPatientMode('existing')}
                  color={patientMode === 'existing' ? 'primary' : 'default'}
                  clickable
                  size="small"
                />
                <Chip
                  label={t('oe_new')}
                  onClick={() => setPatientMode('new')}
                  color={patientMode === 'new' ? 'primary' : 'default'}
                  clickable
                  size="small"
                />
              </Stack>

              {patientMode === 'existing' ? (
                <Autocomplete
                  options={patientResults ?? []}
                  getOptionLabel={(o) => {
                    const p = o as { patientId: string; lastName: string; firstName: string };
                    return `${p.lastName}, ${p.firstName} (${p.patientId})`;
                  }}
                  loading={searchingPatients}
                  onInputChange={(_, v) => setPatientSearch(v)}
                  onChange={(_, v) => setSelectedPatient(v)}
                  renderInput={(params) => (
                    <TextField {...params} label={t('oe_searchPatient')} size="small" fullWidth />
                  )}
                  size="small"
                />
              ) : (
                <Stack spacing={1.5}>
                  <TextField label={t('oe_lastName')} required size="small" value={form.patientLastName} onChange={(e) => setForm({ ...form, patientLastName: e.target.value })} />
                  <TextField label={t('oe_firstName')} required size="small" value={form.patientFirstName} onChange={(e) => setForm({ ...form, patientFirstName: e.target.value })} />
                  <TextField label={t('oe_dateOfBirth')} required type="date" size="small" value={form.patientDateOfBirth} onChange={(e) => setForm({ ...form, patientDateOfBirth: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <FormControl size="small" required>
                    <InputLabel>{t('oe_sex')}</InputLabel>
                    <Select label={t('oe_sex')} value={form.patientSex} onChange={(e) => setForm({ ...form, patientSex: e.target.value })}>
                      {(['Male', 'Female', 'Other', 'Unknown'] as const).map((s) => {
                        const labels = { Male: t('oe_sexMale'), Female: t('oe_sexFemale'), Other: t('oe_sexOther'), Unknown: t('oe_sexUnknown') };
                        return <MenuItem key={s} value={s}>{labels[s]}</MenuItem>;
                      })}
                    </Select>
                  </FormControl>
                </Stack>
              )}
            </Paper>
          </Grid>

          {/* Clinician section */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                {t('oe_clinician')}
              </Typography>
              <Stack direction="row" spacing={1} mb={2}>
                <Chip label={t('oe_existing')} onClick={() => setDoctorMode('existing')} color={doctorMode === 'existing' ? 'primary' : 'default'} clickable size="small" />
                <Chip label={t('oe_new')} onClick={() => setDoctorMode('new')} color={doctorMode === 'new' ? 'primary' : 'default'} clickable size="small" />
              </Stack>
              {doctorMode === 'existing' ? (
                <Autocomplete
                  options={doctorResults ?? []}
                  getOptionLabel={(o) => { const d = o as { lastName: string; firstName: string }; return `${d.lastName}, ${d.firstName}`; }}
                  loading={searchingDoctors}
                  onInputChange={(_, v) => setDoctorSearch(v)}
                  onChange={(_, v) => setSelectedDoctor(v)}
                  renderInput={(params) => <TextField {...params} label={t('oe_searchClinician')} size="small" fullWidth />}
                  size="small"
                />
              ) : (
                <Stack spacing={1.5}>
                  <TextField label={t('oe_lastName')} required size="small" value={form.doctorLastName} onChange={(e) => setForm({ ...form, doctorLastName: e.target.value })} />
                  <TextField label={t('oe_firstName')} required size="small" value={form.doctorFirstName} onChange={(e) => setForm({ ...form, doctorFirstName: e.target.value })} />
                </Stack>
              )}
            </Paper>
          </Grid>

          {/* Case details */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                {t('oe_caseDetails')}
              </Typography>
              <FormControl size="small" sx={{ minWidth: 240 }} required>
                <InputLabel>{t('oe_caseType')}</InputLabel>
                <Select label={t('oe_caseType')} value={form.caseType} onChange={(e) => {
                  setForm({ ...form, caseType: e.target.value });
                  // Reset specimens when switching case type
                  setSpecimens([{ id: '1', site: '', bodySiteId: '', specimenTypeId: '', coldIschemicTime: '' }]);
                }}>
                  <MenuItem value="Surgical Pathology">{t('oe_surgicalPathology')}</MenuItem>
                  <MenuItem value="Cytology">{t('oe_cytology')}</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          </Grid>

          {/* Specimens */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {t('oe_specimens')}
                </Typography>
                <Button startIcon={<Add />} size="small" onClick={addSpecimen} data-testid="add-specimen-btn">
                  {t('oe_addSpecimen')}
                </Button>
              </Box>
              <Stack spacing={1.5}>
                {specimens.map((spec, index) => {
                  const isCytology = form.caseType === 'Cytology';
                  const hierarchy = isCytology ? CYTOLOGY_SITE_HIERARCHY : BODY_SITE_HIERARCHY;
                  const hasSubOrgans = spec.site ? (hierarchy[spec.site] ?? []).length > 0 : false;
                  return (
                  <Box key={spec.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography variant="body2" fontWeight={600} color="text.secondary">
                        {t('oe_specimen')} {String.fromCharCode(65 + index)}
                      </Typography>
                      <IconButton size="small" onClick={() => removeSpecimen(spec.id)} disabled={specimens.length === 1}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                    <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                      {/* Site */}
                      <FormControl size="small" required>
                        <InputLabel>{t('oe_site')}</InputLabel>
                        <Select
                          label={t('oe_site')}
                          value={spec.site}
                          onChange={(e) => handleSiteChange(spec.id, e.target.value)}
                        >
                          {Object.keys(hierarchy).map((site) => (
                            <MenuItem key={site} value={site}>{tSite(site)}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      {/* Organ — only shown when site has sub-organs */}
                      {hasSubOrgans ? (
                        <FormControl size="small" required disabled={!spec.site}>
                          <InputLabel>{t('oe_organ')}</InputLabel>
                          <Select
                            label={t('oe_organ')}
                            value={spec.bodySiteId}
                            onChange={(e) => updateSpecimen(spec.id, 'bodySiteId', e.target.value as number)}
                          >
                            {spec.site && (hierarchy[spec.site] ?? []).map((organ) => {
                              const match = (bodySites as Array<{ bodySiteId: number; bodySiteName: string }> ?? [])
                                .find((s) => s.bodySiteName === organ);
                              return match ? (
                                <MenuItem key={match.bodySiteId} value={match.bodySiteId}>{tOrgan(organ)}</MenuItem>
                              ) : null;
                            })}
                          </Select>
                        </FormControl>
                      ) : (
                        // Spacer to keep grid aligned when no organ dropdown
                        <Box />
                      )}
                      {/* Specimen Type — surgical pathology only */}
                      {!isCytology && (
                        <FormControl size="small" required>
                          <InputLabel>{t('oe_specimenType')}</InputLabel>
                          <Select
                            label={t('oe_specimenType')}
                            value={spec.specimenTypeId}
                            onChange={(e) => updateSpecimen(spec.id, 'specimenTypeId', e.target.value as number)}
                          >
                            {(specimenTypes as Array<{ specimenTypeId: number; specimenTypeName: string }> ?? []).map((t) => (
                              <MenuItem key={t.specimenTypeId} value={t.specimenTypeId}>{tSpecimenType(t.specimenTypeName)}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                      {/* Cold Ischemic Time — surgical pathology only */}
                      {!isCytology && (
                        <TextField
                          label={t('oe_coldIschemicTime')}
                          size="small"
                          type="number"
                          inputProps={{ min: 0 }}
                          value={spec.coldIschemicTime}
                          onChange={(e) => updateSpecimen(spec.id, 'coldIschemicTime', e.target.value)}
                          required
                        />
                      )}
                    </Box>
                  </Box>
                  );
                })}
              </Stack>
            </Paper>
          </Grid>

          {/* Submit */}
          <Grid item xs={12}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={createMutation.isPending}
              data-testid="submit-order-btn"
            >
              {createMutation.isPending ? <CircularProgress size={24} /> : t('oe_createCase')}
            </Button>
          </Grid>
        </Grid>
      </Box>

      <Snackbar
        open={successOpen}
        autoHideDuration={6000}
        onClose={() => setSuccessOpen(false)}
        message={createdOrder ? `${t('oe_caseCreated')} ${formatOrderIdDisplay(createdOrder.orderId)}` : ''}
      />

      {/* Navigation guard dialog handled by NavigationGuardProvider */}
    </Box>
  );
}
