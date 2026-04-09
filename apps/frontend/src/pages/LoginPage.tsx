import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { Person, Add, Translate } from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { employeeApi, lookupApi } from '../api';
import type { Employee, EmployeeRole } from '@lis/shared';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [error, setError] = useState<string | null>(null);

  // New employee form state
  const [newForm, setNewForm] = useState({
    firstName: '',
    lastName: '',
    userName: '',
    employeeRoleId: '' as number | '',
    defaultLanguage: 'en' as 'en' | 'sw',
  });

  const { data: roles } = useQuery<EmployeeRole[]>({
    queryKey: ['employee-roles'],
    queryFn: lookupApi.employeeRoles,
  });

  const { data: searchResults, isLoading: searching } = useQuery<Employee[]>({
    queryKey: ['employee-search', searchQuery],
    queryFn: () => employeeApi.search(searchQuery),
    enabled: searchQuery.length >= 1,
  });

  const loginMutation = useMutation({
    mutationFn: (payload: Parameters<typeof login>[0]) => login(payload),
    onSuccess: () => navigate('/'),
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Login failed. Please try again.'
      );
    },
  });

  const handleSelectEmployee = (emp: Employee) => {
    setError(null);
    loginMutation.mutate({ employeeId: Number(emp.employeeId) });
  };

  const handleNewEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newForm.firstName || !newForm.lastName || !newForm.userName || !newForm.employeeRoleId) {
      setError(t('login_allFieldsRequired'));
      return;
    }
    loginMutation.mutate({
      newEmployee: {
        firstName: newForm.firstName,
        lastName: newForm.lastName,
        userName: newForm.userName,
        employeeRoleId: Number(newForm.employeeRoleId),
        defaultLanguage: newForm.defaultLanguage,
      },
    });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 480 }} elevation={4}>
        <CardContent sx={{ p: 4 }}>
          <Box textAlign="center" mb={3}>
            <Typography variant="h5" fontWeight={700} color="primary">
              {t('appName')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('appFull')}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Mode toggle */}
          <Stack direction="row" spacing={1} mb={3}>
            <Button
              variant={mode === 'search' ? 'contained' : 'outlined'}
              fullWidth
              onClick={() => setMode('search')}
              size="small"
            >
              {t('login_findEmployee')}
            </Button>
            <Button
              variant={mode === 'new' ? 'contained' : 'outlined'}
              fullWidth
              onClick={() => setMode('new')}
              startIcon={<Add />}
              size="small"
            >
              {t('login_newEmployee')}
            </Button>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {mode === 'search' && (
            <>
              <TextField
                label={t('login_searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                fullWidth
                autoFocus
                size="small"
                sx={{ mb: 1 }}
                inputProps={{ 'data-testid': 'employee-search-input' }}
              />
              {searching && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 1 }} />}
              {searchResults && searchResults.length > 0 && (
                <List dense>
                  {searchResults.map((emp) => (
                    <ListItemButton
                      key={Number(emp.employeeId)}
                      onClick={() => handleSelectEmployee(emp)}
                      data-testid={`employee-option-${emp.userName}`}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                          {emp.firstName?.charAt(0)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={`${emp.lastName}, ${emp.firstName}`}
                        secondary={`${emp.userName} — ${(emp.employeeRole as { roleName?: string })?.roleName ?? ''}`}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
              {searchResults?.length === 0 && searchQuery.length > 0 && (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                  {t('login_noEmployeesFound')}
                </Typography>
              )}
            </>
          )}

          {mode === 'new' && (
            <Box component="form" onSubmit={handleNewEmployeeSubmit}>
              <Stack spacing={2}>
                <TextField
                  label={t('login_firstName')}
                  required
                  value={newForm.firstName}
                  onChange={(e) => setNewForm({ ...newForm, firstName: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ 'data-testid': 'new-employee-firstname' }}
                />
                <TextField
                  label={t('login_lastName')}
                  required
                  value={newForm.lastName}
                  onChange={(e) => setNewForm({ ...newForm, lastName: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ 'data-testid': 'new-employee-lastname' }}
                />
                <TextField
                  label={t('login_username')}
                  required
                  value={newForm.userName}
                  onChange={(e) => setNewForm({ ...newForm, userName: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ 'data-testid': 'new-employee-username' }}
                />
                <FormControl size="small" required fullWidth>
                  <InputLabel>{t('login_role')}</InputLabel>
                  <Select
                    label={t('login_role')}
                    value={newForm.employeeRoleId}
                    onChange={(e) => setNewForm({ ...newForm, employeeRoleId: e.target.value as number })}
                    inputProps={{ 'data-testid': 'new-employee-role' }}
                  >
                    {roles?.map((r) => (
                      <MenuItem key={r.employeeRoleId} value={r.employeeRoleId}>
                        {r.roleName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box>
                  <Box display="flex" alignItems="center" gap={0.75} mb={0.75}>
                    <Translate sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {t('login_defaultLanguage')}
                    </Typography>
                  </Box>
                  <ToggleButtonGroup
                    value={newForm.defaultLanguage}
                    exclusive
                    onChange={(_, v) => v && setNewForm({ ...newForm, defaultLanguage: v })}
                    size="small"
                    fullWidth
                  >
                    <ToggleButton value="en">English</ToggleButton>
                    <ToggleButton value="sw">Kiswahili</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loginMutation.isPending}
                  data-testid="new-employee-submit"
                >
                  {loginMutation.isPending ? <CircularProgress size={20} /> : t('login_createAndLogin')}
                </Button>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
