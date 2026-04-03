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

const SECTIONS = [
  {
    title: 'Order Entry',
    description: 'Register a new pathology case. Enter patient and clinician details, add specimens, and generate the case worksheet.',
    icon: <Assignment fontSize="large" color="primary" />,
    path: '/order-entry',
  },
  {
    title: 'Processing Queue',
    description: 'Cases awaiting grossing and block/slide preparation. Select a case to record blocks and slides for each specimen.',
    icon: <Science fontSize="large" color="primary" />,
    path: '/processing',
  },
  {
    title: 'Result Queue',
    description: 'Cases with slides prepared, ready for microscopic examination and reporting. Sign out completed cases here.',
    icon: <Description fontSize="large" color="primary" />,
    path: '/result',
  },
  {
    title: 'Query',
    description: 'Search for any case by case ID or patient ID to review its current status, materials, and reports.',
    icon: <Search fontSize="large" color="primary" />,
    path: '/query',
  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)', color: '#fff' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          AP LIS
        </Typography>
        <Typography variant="h6" fontWeight={400} gutterBottom>
          Anatomic Pathology Laboratory Information System
        </Typography>
        <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.3)' }} />
        <Typography variant="body1">
          A lightweight workflow management system for anatomic pathology laboratories. Track cases from initial registration
          through grossing, slide preparation, microscopic examination, and final sign-out.
        </Typography>
        {user && (
          <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.85 }}>
            Logged in as <strong>{user.userName}</strong> &middot; {user.role}
          </Typography>
        )}
      </Paper>

      <Typography variant="h6" fontWeight={600} mb={2}>
        Workflow
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
                      {section.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {section.description}
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
