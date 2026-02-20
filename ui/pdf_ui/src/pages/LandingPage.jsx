import React, { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';

// MUI Components
import {
  Box,
  Typography,
  Button,
  Container,
} from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';

// Styled Components
import { styled } from '@mui/system';

const LandingPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.isLoading) return;
    if (auth.isAuthenticated) {
      navigate(‘/app’, { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);

  const handleSignIn = () => {
    setLoading(true);
    setTimeout(() => {
      auth.signinRedirect();
    }, 1000);
  };

  if (auth.isLoading) {
    return (
      <Box
        sx={{
          minHeight: ‘100vh’,
          display: ‘flex’,
          alignItems: ‘center’,
          justifyContent: ‘center’,
          backgroundColor: ‘#fff’,
        }}
      >
        <CircularProgress size={50} thickness={5} sx={{ color: ‘#000’ }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        backgroundColor: ‘#fff’,
        minHeight: ‘100vh’,
        display: ‘flex’,
        flexDirection: ‘column’,
        fontFamily: ‘Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif’,
      }}
    >
      {/* Header with UMBC Black bar */}
      <Box
        sx={{
          backgroundColor: ‘#000’,
          height: ‘80px’,
          width: ‘100%’,
          display: ‘flex’,
          alignItems: ‘center’,
          justifyContent: ‘space-between’,
          px: 4,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            color: ‘#fdb515’,
            fontWeight: 600,
            letterSpacing: ‘0.5px’,
          }}
        >
          PDF Accessibility
        </Typography>
      </Box>

      {/* Main Content */}
      <Container
        maxWidth="md"
        sx={{
          flex: 1,
          display: ‘flex’,
          flexDirection: ‘column’,
          alignItems: ‘center’,
          justifyContent: ‘center’,
          py: 8,
          textAlign: ‘center’,
        }}
      >
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: 600,
            mb: 3,
            color: ‘#000’,
          }}
        >
          PDF Accessibility Remediation
        </Typography>

        <Typography
          variant="h6"
          sx={{
            mb: 5,
            color: ‘#636466’,
            maxWidth: ‘600px’,
            lineHeight: 1.6,
            fontWeight: 400,
          }}
        >
          Transform your PDF documents to meet WCAG 2.1 Level AA accessibility standards.
          Our automated solution improves document accessibility with tagging, metadata cleanup,
          and AI-powered alt-text generation.
        </Typography>

        <Button
          variant="contained"
          size="large"
          onClick={handleSignIn}
          disabled={loading}
          sx={{
            backgroundColor: ‘#fdb515’,
            color: ‘#000’,
            fontWeight: 600,
            fontSize: ‘1.1rem’,
            px: 6,
            py: 2,
            borderRadius: ‘8px’,
            textTransform: ‘none’,
            transition: ‘all 0.2s’,
            ‘&:hover’: {
              backgroundColor: ‘#e6a413’,
              transform: ‘translateY(-2px)’,
              boxShadow: ‘0 4px 12px rgba(253, 181, 21, 0.4)’,
            },
            ‘&:disabled’: {
              backgroundColor: ‘#c7c8ca’,
              color: ‘#636466’,
            },
          }}
        >
          {loading ? <CircularProgress size={24} sx={{ color: ‘#000’ }} /> : ‘Sign In’}
        </Button>
      </Container>

      {/* Footer */}
      <Box
        sx={{
          borderTop: ‘1px solid #c7c8ca’,
          py: 3,
          textAlign: ‘center’,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: ‘#636466’,
          }}
        >
          University of Maryland, Baltimore County
        </Typography>
      </Box>
    </Box>
  );
};

export default LandingPage;
