import { createTheme } from '@mui/material/styles';
import {
  PRIMARY_MAIN,
  SECONDARY_MAIN,
  CHAT_LEFT_PANEL_BACKGROUND,
  HEADER_BACKGROUND,
  primary_50
} from './utilities/constants.jsx';  // Import constants

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  typography: {
    fontFamily: 'Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    h1: {
      fontSize: '2.5rem',
      '@media (max-width:600px)': {
        fontSize: '2rem',
      },
    },
    h2: {
      fontSize: '2rem',
      '@media (max-width:600px)': {
        fontSize: '1.75rem',
      },
    },
    h3: {
      fontSize: '1.75rem',
      '@media (max-width:600px)': {
        fontSize: '1.5rem',
      },
    },
    h4: {
      fontSize: '1.5rem',
      '@media (max-width:600px)': {
        fontSize: '1.25rem',
      },
    },
    h5: {
      fontSize: '1.25rem',
      '@media (max-width:600px)': {
        fontSize: '1.125rem',
      },
    },
    h6: {
      fontSize: '1.125rem',
      '@media (max-width:600px)': {
        fontSize: '1rem',
      },
    },
    body1: {
      fontSize: '1rem',
      '@media (max-width:600px)': {
        fontSize: '0.875rem',
      },
    },
    body2: {
      fontSize: '0.875rem',
      '@media (max-width:600px)': {
        fontSize: '0.8125rem',
      },
    },
  },
  palette: {
    primary: {
      main: PRIMARY_MAIN,
      50: primary_50,
    },
    secondary: {
      main: SECONDARY_MAIN,
    },
    background: {
      chatLeftPanel: CHAT_LEFT_PANEL_BACKGROUND,
      header: HEADER_BACKGROUND,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,  // Rounded corners for buttons
          textTransform: 'none',  // Disable text transform on buttons
          minHeight: 44, // Minimum touch target size for mobile
          '@media (max-width:600px)': {
            minHeight: 48, // Larger touch targets on mobile
            fontSize: '0.875rem',
            padding: '12px 16px',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minHeight: 44, // Minimum touch target size for mobile
          minWidth: 44,
          '@media (max-width:600px)': {
            minHeight: 48,
            minWidth: 48,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          '@media (max-width:900px)': {
            width: '100%',
            maxWidth: '320px',
          },
        },
      },
    },
  },
});

export default theme;
