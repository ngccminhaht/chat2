import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2563eb", dark: "#1d4ed8", contrastText: "#ffffff" },
    secondary: { main: "#475569", contrastText: "#ffffff" },
    background: { default: "#f8fafc", paper: "#ffffff" },
    text: { primary: "#0f172a", secondary: "#64748b" },
    divider: "#e2e8f0",
    success: { main: "#16a34a" },
    warning: { main: "#d97706" },
    error: { main: "#dc2626" },
    info: { main: "#2563eb" },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: "24px", lineHeight: 1.33, fontWeight: 600 },
    h2: { fontSize: "20px", lineHeight: 1.4, fontWeight: 600 },
    h3: { fontSize: "16px", lineHeight: 1.5, fontWeight: 600 },
    h4: { fontSize: "16px", lineHeight: 1.5, fontWeight: 600 },
    h5: { fontSize: "16px", lineHeight: 1.5, fontWeight: 600 },
    h6: { fontSize: "14px", lineHeight: 1.43, fontWeight: 600 },
    body1: { fontSize: "14px", lineHeight: 1.43 },
    body2: { fontSize: "13px", lineHeight: 1.5 },
    caption: { fontSize: "12px", lineHeight: 1.4 },
    button: { fontSize: "14px", fontWeight: 600, textTransform: "none" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: "#f8fafc", color: "#0f172a" },
        "*::selection": { backgroundColor: "#dbeafe" },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          color: "#0f172a",
          backgroundColor: "#ffffff",
          boxShadow: "none",
          borderBottom: "1px solid #e2e8f0",
        },
      },
    },
    MuiToolbar: { styleOverrides: { root: { minHeight: "56px !important" } } },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderColor: "#e2e8f0" },
      },
    },
    MuiCard: { styleOverrides: { root: { borderRadius: 8, boxShadow: "none" } } },
    MuiButton: {
      styleOverrides: {
        root: { minHeight: 36, borderRadius: 8, boxShadow: "none" },
        contained: { boxShadow: "none", "&:hover": { boxShadow: "none" } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: "#ffffff",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#94a3b8" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 1, borderColor: "#2563eb" },
        },
      },
    },
    MuiTabs: { styleOverrides: { indicator: { height: 2, borderRadius: 2 } } },
    MuiTableCell: {
      styleOverrides: {
        head: { color: "#475569", backgroundColor: "#f8fafc", fontWeight: 600 },
        root: { borderColor: "#e2e8f0" },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 12, boxShadow: "0 12px 32px rgb(15 23 42 / 16%)" } } },
  },
});

export default theme;
