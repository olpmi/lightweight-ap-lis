import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
  Button,
  Avatar,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Assignment,
  Science,
  Description,
  Search,
  Logout,
  Menu,
  ChevronLeft,
  Add,
  Home,
  Translate,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { type Lang, useLanguage } from '../../hooks/useLanguage';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import { employeeApi } from '../../api';

const DRAWER_WIDTH = 220;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { lang, setLang, t, languageOptions, tRole } = useLanguage();
  const { guardedNavigate } = useNavigationGuard();

  // Apply the employee's saved language preference on login / session restore
  useEffect(() => {
    if (user?.defaultLanguage) {
      setLang(user.defaultLanguage);
    }
  }, [setLang, user?.defaultLanguage]);

  const handleSetLang = (l: Lang) => {
    setLang(l);
    if (user) {
      employeeApi.updateLanguage(user.employeeId, l).catch(() => {/* non-fatal */});
    }
  };

  const NAV_ITEMS = [
    { label: t('nav_home'), path: '/', icon: <Home /> },
    { label: t('nav_orderEntry'), path: '/order-entry', icon: <Add /> },
    { label: t('nav_processing'), path: '/processing', icon: <Science /> },
    { label: t('nav_result'), path: '/result', icon: <Description /> },
    { label: t('nav_query'), path: '/query', icon: <Search /> },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setOpen(!open)} sx={{ mr: 1 }}>
            {open ? <ChevronLeft /> : <Menu />}
          </IconButton>
          <Assignment sx={{ mr: 1 }} />
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {t('appName')}
          </Typography>
          <Divider orientation="vertical" flexItem sx={{ mx: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
          <Box
            display="flex"
            alignItems="center"
            gap={0.75}
            sx={{
              maxWidth: { xs: 360, lg: 'none' },
              overflowX: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            <Translate sx={{ fontSize: 20, opacity: 0.9, color: 'inherit', flexShrink: 0 }} />
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: 'rgba(255,255,255,0.92)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Language / Lugha
            </Typography>
            <ToggleButtonGroup
              value={lang}
              exclusive
              onChange={(_, v) => v && handleSetLang(v)}
              size="small"
              sx={{
                flexWrap: 'nowrap',
                '& .MuiToggleButton-root': {
                  color: 'rgba(255,255,255,0.78)',
                  borderColor: 'rgba(255,255,255,0.35)',
                  fontSize: 12,
                  fontWeight: 600,
                  py: 0.4,
                  px: 1.05,
                  lineHeight: 1.3,
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                },
                '& .Mui-selected': {
                  bgcolor: 'rgba(255,255,255,0.22) !important',
                  color: '#fff !important',
                  borderBottom: '2px solid #fff',
                },
              }}
            >
              {languageOptions.map((option) => (
                <ToggleButton key={option.code} value={option.code}>
                  {option.nativeLabel}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
          {user && (
            <Box display="flex" alignItems="center" gap={1}>
              <Tooltip title={`${user.userName} — ${tRole(user.role)}`}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: 14 }}>
                  {user.userName?.charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
              <Button color="inherit" startIcon={<Logout />} onClick={handleLogout} size="small">
                {t('nav_logout')}
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Drawer
        variant="persistent"
        open={open}
        sx={{
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: 64, // AppBar height
            height: 'calc(100% - 64px)',
          },
        }}
      >
        <Divider />
        <List dense>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.path}
              selected={item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)}
              onClick={() => guardedNavigate(item.path)}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          pt: 10, // below AppBar
          ml: open ? `${DRAWER_WIDTH}px` : 0,
          width: open ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
          transition: (theme) =>
            theme.transitions.create(['margin', 'width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          backgroundColor: 'background.default',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
