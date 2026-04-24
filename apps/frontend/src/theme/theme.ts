import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1565c0',
    },
    secondary: {
      main: '#0288d1',
    },
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'var(--app-font-family)',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          '--app-font-family': '"Roboto", "Helvetica", "Arial", sans-serif',
        },
        'html[lang="ar"]': {
          '--app-font-family': '"Noto Naskh Arabic", "Roboto", "Helvetica", "Arial", sans-serif',
        },
        'html[lang="ur"]': {
          '--app-font-family': '"Noto Nastaliq Urdu", "Noto Naskh Arabic", "Roboto", "Helvetica", "Arial", sans-serif',
        },
        'body': {
          fontFamily: 'var(--app-font-family)',
        },
        'button, input, textarea, select': {
          font: 'inherit',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#e3f2fd',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      defaultProps: {
        size: 'small',
      },
    },
  },
});
