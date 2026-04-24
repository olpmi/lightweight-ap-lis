import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Divider,
  Paper,
} from '@mui/material';
import { Assignment, Science, Description, Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, tRole } = useLanguage();

  const SECTIONS = [
    { titleKey: 'dash_orderEntry_title' as const, descKey: 'dash_orderEntry_desc' as const, icon: <Assignment fontSize="large" color="primary" />, path: '/order-entry' },
    { titleKey: 'dash_processing_title' as const, descKey: 'dash_processing_desc' as const, icon: <Science fontSize="large" color="primary" />, path: '/processing' },
    { titleKey: 'dash_result_title' as const, descKey: 'dash_result_desc' as const, icon: <Description fontSize="large" color="primary" />, path: '/result' },
    { titleKey: 'dash_query_title' as const, descKey: 'dash_query_desc' as const, icon: <Search fontSize="large" color="primary" />, path: '/query' },
  ];

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)', color: '#fff' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {t('appName')}
        </Typography>
        <Typography variant="h6" fontWeight={400} gutterBottom>
          {t('appFull')}
        </Typography>
        <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.3)' }} />
        <Typography variant="body1">
          {t('dash_systemDesc')}
        </Typography>
        {user && (
          <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.85 }}>
            {t('dash_loggedInAs')} <strong>{user.userName}</strong> &middot; {tRole(user.role)}
          </Typography>
        )}
      </Paper>

      <Typography variant="h6" fontWeight={600} mb={2}>
        {t('dash_workflow')}
      </Typography>

      <Grid container spacing={3}>
        {SECTIONS.map((section) => (
          <Grid item xs={12} sm={6} key={section.path}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea
                onClick={() => navigate(section.path)}
                sx={{ height: '100%', alignItems: 'flex-start', p: 1 }}
              >
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1.5} mb={1.5}>
                    {section.icon}
                    <Typography variant="h6" fontWeight={600}>
                      {t(section.titleKey)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {t(section.descKey)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
