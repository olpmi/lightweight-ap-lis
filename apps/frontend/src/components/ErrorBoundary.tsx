import React from 'react';
import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';

interface Props {
  children: React.ReactNode;
  /** Optional fallback override. Receives the captured error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Prevents a single render error from blanking out
 * the entire app. Logs to the console (which is forwarded to devtools and any
 * future error-reporting integration).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        p={3}
      >
        <Alert severity="error" sx={{ maxWidth: 720, width: '100%' }}>
          <AlertTitle>Something went wrong</AlertTitle>
          <Typography variant="body2" sx={{ mt: 1, mb: 2, whiteSpace: 'pre-wrap' }}>
            {error.message}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button variant="outlined" onClick={this.reset}>
              Try again
            </Button>
          </Stack>
        </Alert>
      </Box>
    );
  }
}
