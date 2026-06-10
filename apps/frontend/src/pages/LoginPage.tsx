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
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Add, Translate, Visibility, VisibilityOff, ArrowBack } from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { type Lang, useLanguage } from '../hooks/useLanguage';
import { employeeApi, lookupApi } from '../api';
import { qk } from '../api/queryKeys';
import type { Employee, EmployeeRole } from '@lis/shared';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, languageOptions, tRole } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [error, setError] = useState<string | null>(null);

  // Password auth is only active when VITE_PASSWORD_AUTH=true (production builds).
  const passwordAuthEnabled = import.meta.env.VITE_PASSWORD_AUTH === 'true';

  // "Find employee" password step
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // New employee form state
  const [newForm, setNewForm] = useState({
    firstName: '',
    lastName: '',
    userName: '',
    employeeRoleId: '' as number | '',
    defaultLanguage: 'en' as Lang,
    password: '',
    confirmPassword: '',
  });
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: roles } = useQuery<EmployeeRole[]>({
    queryKey: qk.employeeRoles,
    queryFn: lookupApi.employeeRoles,
  });

  const { data: searchResults, isLoading: searching } = useQuery<Employee[]>({
    queryKey: qk.employeeSearch(searchQuery),
    queryFn: () => employeeApi.search(searchQuery),
    enabled: searchQuery.length >= 1,
  });

  const loginMutation = useMutation({
    mutationFn: (payload: Parameters<typeof login>[0]) => login(payload),
    onSuccess: () => navigate('/'),
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('login_failed')
      );
    },
  });

  const handleSelectEmployee = (emp: Employee) => {
    setError(null);
    setLoginPassword('');
    // In dev (password auth disabled) log in immediately on employee selection.
    if (!passwordAuthEnabled) {
      loginMutation.mutate({ employeeId: Number(emp.employeeId) });
      return;
    }
    setSelectedEmployee(emp);
  };

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginPassword) {
      setError(t('login_allFieldsRequired'));
      return;
    }
    loginMutation.mutate({ employeeId: Number(selectedEmployee!.employeeId), password: loginPassword });
  };

  const handleNewEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newForm.firstName || !newForm.lastName || !newForm.userName || !newForm.employeeRoleId) {
      setError(t('login_allFieldsRequired'));
      return;
    }
    if (passwordAuthEnabled) {
      if (!newForm.password) {
        setError(t('login_allFieldsRequired'));
        return;
      }
      if (newForm.password !== newForm.confirmPassword) {
        setError(t('login_passwordMismatch'));
        return;
      }
    }
    loginMutation.mutate({
      newEmployee: {
        firstName: newForm.firstName,
        lastName: newForm.lastName,
        userName: newForm.userName,
        employeeRoleId: Number(newForm.employeeRoleId),
        defaultLanguage: newForm.defaultLanguage,
        ...(passwordAuthEnabled && newForm.password ? { password: newForm.password } : {}),
      },
    });
  };

  const handleModeChange = (newMode: 'search' | 'new') => {
    setMode(newMode);
    setSelectedEmployee(null);
    setLoginPassword('');
    setError(null);
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
              onClick={() => handleModeChange('search')}
              size="small"
            >
              {t('login_findEmployee')}
            </Button>
            <Button
              variant={mode === 'new' ? 'contained' : 'outlined'}
              fullWidth
              onClick={() => handleModeChange('new')}
              startIcon={<Add />}
              size="small"
            >
              {t('login_newEmployee')}
            </Button>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {mode === 'search' && !selectedEmployee && (
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
                        secondary={`${emp.userName} — ${tRole((emp.employeeRole as { roleName?: string })?.roleName ?? '')}`}
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

          {mode === 'search' && selectedEmployee && (
            <Box component="form" onSubmit={handlePasswordLogin}>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconButton size="small" onClick={() => { setSelectedEmployee(null); setError(null); }}>
                    <ArrowBack fontSize="small" />
                  </IconButton>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {selectedEmployee.lastName}, {selectedEmployee.firstName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {selectedEmployee.userName} — {tRole((selectedEmployee.employeeRole as { roleName?: string })?.roleName ?? '')}
                    </Typography>
                  </Box>
                </Stack>
                {passwordAuthEnabled && (
                  <TextField
                    label={t('login_password')}
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{ 'data-testid': 'login-password' }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowLoginPassword((v) => !v)} edge="end">
                            {showLoginPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loginMutation.isPending}
                  data-testid="login-submit"
                >
                  {loginMutation.isPending ? <CircularProgress size={20} /> : t('login_login')}
                </Button>
              </Stack>
            </Box>
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
                    data-testid="new-employee-role"
                  >
                    {roles?.map((r) => (
                      <MenuItem key={r.employeeRoleId} value={r.employeeRoleId}>
                        {tRole(r.roleName)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {passwordAuthEnabled && (
                  <>
                    <TextField
                      label={t('login_password')}
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newForm.password}
                      onChange={(e) => setNewForm({ ...newForm, password: e.target.value })}
                      fullWidth
                      size="small"
                      helperText={t('login_passwordHint')}
                      inputProps={{ 'data-testid': 'new-employee-password' }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowNewPassword((v) => !v)} edge="end">
                              {showNewPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <TextField
                      label={t('login_confirmPassword')}
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newForm.confirmPassword}
                      onChange={(e) => setNewForm({ ...newForm, confirmPassword: e.target.value })}
                      fullWidth
                      size="small"
                      inputProps={{ 'data-testid': 'new-employee-confirm-password' }}
                    />
                  </>
                )}
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
                    {languageOptions.map((option) => (
                      <ToggleButton key={option.code} value={option.code}>
                        {option.nativeLabel}
                      </ToggleButton>
                    ))}
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
