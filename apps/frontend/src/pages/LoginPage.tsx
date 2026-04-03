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
} from '@mui/material';
import { Person, Add } from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { employeeApi, lookupApi } from '../api';
import type { Employee, EmployeeRole } from '@lis/shared';

export default function LoginPage() {
  const { login } = useAuth();
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
      setError('All fields are required for a new employee');
      return;
    }
    loginMutation.mutate({
      newEmployee: {
        firstName: newForm.firstName,
        lastName: newForm.lastName,
        userName: newForm.userName,
        employeeRoleId: Number(newForm.employeeRoleId),
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
              AP LIS
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Anatomic Pathology Laboratory Information System
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
              Find employee
            </Button>
            <Button
              variant={mode === 'new' ? 'contained' : 'outlined'}
              fullWidth
              onClick={() => setMode('new')}
              startIcon={<Add />}
              size="small"
            >
              New employee
            </Button>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {mode === 'search' && (
            <>
              <TextField
                label="Search by name or username"
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
                  No employees found. Try creating a new one.
                </Typography>
              )}
            </>
          )}

          {mode === 'new' && (
            <Box component="form" onSubmit={handleNewEmployeeSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="First Name"
                  required
                  value={newForm.firstName}
                  onChange={(e) => setNewForm({ ...newForm, firstName: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ 'data-testid': 'new-employee-firstname' }}
                />
                <TextField
                  label="Last Name"
                  required
                  value={newForm.lastName}
                  onChange={(e) => setNewForm({ ...newForm, lastName: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ 'data-testid': 'new-employee-lastname' }}
                />
                <TextField
                  label="Username"
                  required
                  value={newForm.userName}
                  onChange={(e) => setNewForm({ ...newForm, userName: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ 'data-testid': 'new-employee-username' }}
                />
                <FormControl size="small" required fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select
                    label="Role"
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
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loginMutation.isPending}
                  data-testid="new-employee-submit"
                >
                  {loginMutation.isPending ? <CircularProgress size={20} /> : 'Create & Login'}
                </Button>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
