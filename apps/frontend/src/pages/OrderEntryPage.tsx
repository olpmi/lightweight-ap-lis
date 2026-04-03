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
} from '@mui/material';
import { Add, Delete, Download } from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { orderApi, lookupApi, patientApi, doctorApi } from '../api';
import { formatOrderIdDisplay } from '@lis/shared';

interface SpecimenRow {
  id: string;
  bodySiteId: number | '';
  specimenTypeId: number | '';
}

export default function OrderEntryPage() {
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

  const [specimens, setSpecimens] = useState<SpecimenRow[]>([{ id: '1', bodySiteId: '', specimenTypeId: '' }]);
  const [createdOrder, setCreatedOrder] = useState<{ orderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

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
          ?.message ?? 'Failed to create order'
      );
    },
  });

  const addSpecimen = () =>
    setSpecimens([...specimens, { id: String(Date.now()), bodySiteId: '', specimenTypeId: '' }]);

  const removeSpecimen = (id: string) =>
    setSpecimens(specimens.filter((s) => s.id !== id));

  const updateSpecimen = (id: string, field: keyof SpecimenRow, value: number | '') =>
    setSpecimens(specimens.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {
      registeredDate: new Date().toISOString(),
      caseType: form.caseType,
      specimens: specimens.map((s) => ({
        bodySiteId: s.bodySiteId || undefined,
        specimenTypeId: s.specimenTypeId || undefined,
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
        Order Entry
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
              Worksheet PDF
            </Button>
          }
        >
          <Typography fontWeight={700} variant="h6" component="span">
            Case created: {formatOrderIdDisplay(createdOrder.orderId)}
          </Typography>
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Patient section */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                Patient
              </Typography>
              <Stack direction="row" spacing={1} mb={2}>
                <Chip
                  label="Existing"
                  onClick={() => setPatientMode('existing')}
                  color={patientMode === 'existing' ? 'primary' : 'default'}
                  clickable
                  size="small"
                />
                <Chip
                  label="New"
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
                    <TextField {...params} label="Search patient" size="small" fullWidth />
                  )}
                  size="small"
                />
              ) : (
                <Stack spacing={1.5}>
                  <TextField label="Last Name" required size="small" value={form.patientLastName} onChange={(e) => setForm({ ...form, patientLastName: e.target.value })} />
                  <TextField label="First Name" required size="small" value={form.patientFirstName} onChange={(e) => setForm({ ...form, patientFirstName: e.target.value })} />
                  <TextField label="Date of Birth" required type="date" size="small" value={form.patientDateOfBirth} onChange={(e) => setForm({ ...form, patientDateOfBirth: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <FormControl size="small" required>
                    <InputLabel>Sex</InputLabel>
                    <Select label="Sex" value={form.patientSex} onChange={(e) => setForm({ ...form, patientSex: e.target.value })}>
                      {['Male', 'Female', 'Other', 'Unknown'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
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
                Clinician
              </Typography>
              <Stack direction="row" spacing={1} mb={2}>
                <Chip label="Existing" onClick={() => setDoctorMode('existing')} color={doctorMode === 'existing' ? 'primary' : 'default'} clickable size="small" />
                <Chip label="New" onClick={() => setDoctorMode('new')} color={doctorMode === 'new' ? 'primary' : 'default'} clickable size="small" />
              </Stack>
              {doctorMode === 'existing' ? (
                <Autocomplete
                  options={doctorResults ?? []}
                  getOptionLabel={(o) => { const d = o as { lastName: string; firstName: string }; return `${d.lastName}, ${d.firstName}`; }}
                  loading={searchingDoctors}
                  onInputChange={(_, v) => setDoctorSearch(v)}
                  onChange={(_, v) => setSelectedDoctor(v)}
                  renderInput={(params) => <TextField {...params} label="Search clinician" size="small" fullWidth />}
                  size="small"
                />
              ) : (
                <Stack spacing={1.5}>
                  <TextField label="Last Name" required size="small" value={form.doctorLastName} onChange={(e) => setForm({ ...form, doctorLastName: e.target.value })} />
                  <TextField label="First Name" required size="small" value={form.doctorFirstName} onChange={(e) => setForm({ ...form, doctorFirstName: e.target.value })} />
                </Stack>
              )}
            </Paper>
          </Grid>

          {/* Case details */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                Case Details
              </Typography>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Case Type</InputLabel>
                <Select label="Case Type" value={form.caseType} onChange={(e) => setForm({ ...form, caseType: e.target.value })}>
                  {['Surgical Pathology', 'Cytology'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Paper>
          </Grid>

          {/* Specimens */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Specimens
                </Typography>
                <Button startIcon={<Add />} size="small" onClick={addSpecimen} data-testid="add-specimen-btn">
                  Add Specimen
                </Button>
              </Box>
              <Stack spacing={1.5}>
                {specimens.map((spec, index) => (
                  <Box key={spec.id} display="flex" alignItems="center" gap={1.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ width: 20 }}>
                      {String.fromCharCode(65 + index)}
                    </Typography>
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Body Site</InputLabel>
                      <Select
                        label="Body Site"
                        value={spec.bodySiteId}
                        onChange={(e) => updateSpecimen(spec.id, 'bodySiteId', e.target.value as number)}
                      >
                        {(bodySites as Array<{ bodySiteId: number; bodySiteName: string }> ?? []).map((s) => (
                          <MenuItem key={s.bodySiteId} value={s.bodySiteId}>{s.bodySiteName}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Specimen Type</InputLabel>
                      <Select
                        label="Specimen Type"
                        value={spec.specimenTypeId}
                        onChange={(e) => updateSpecimen(spec.id, 'specimenTypeId', e.target.value as number)}
                      >
                        {(specimenTypes as Array<{ specimenTypeId: number; specimenTypeName: string }> ?? []).map((t) => (
                          <MenuItem key={t.specimenTypeId} value={t.specimenTypeId}>{t.specimenTypeName}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton size="small" onClick={() => removeSpecimen(spec.id)} disabled={specimens.length === 1}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
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
              {createMutation.isPending ? <CircularProgress size={24} /> : 'Create Case'}
            </Button>
          </Grid>
        </Grid>
      </Box>

      <Snackbar
        open={successOpen}
        autoHideDuration={6000}
        onClose={() => setSuccessOpen(false)}
        message={`Case ${createdOrder?.orderId} created successfully`}
      />
    </Box>
  );
}
