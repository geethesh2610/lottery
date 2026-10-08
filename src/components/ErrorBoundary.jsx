import { Component } from 'react';
import { Alert, AlertTitle, Box, Button } from '@mui/material';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error', error, info);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => this.setState({ error: null })}>Try again</Button>}>
          <AlertTitle>This page crashed</AlertTitle>
          {this.state.error.message}
        </Alert>
      </Box>
    );
  }
}
