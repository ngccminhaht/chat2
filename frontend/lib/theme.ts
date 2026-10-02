import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0060df", dark: "#004ecc", light: "#e7f1ff", contrastText: "#ffffff" },
    secondary: { main: "#637381", contrastText: "#ffffff" },
    background: { default: "#f6f8fa", paper: "#ffffff" },
    text: { primary: "#202223", secondary: "#637381" },
    divider: "#dfe3e8",
    success: { main: "#108043", light: "#e3f1df" },
    warning: { main: "#b98900", light: "#fcf1cd" },
    error: { main: "#de3618", light: "#fbeae5" },
    info: { main: "#0060df", light: "#e7f1ff" },
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: "20px", lineHeight: 1.3, fontWeight: 700 },
    h2: { fontSize: "18px", lineHeight: 1.35, fontWeight: 700 },
    h3: { fontSize: "15px", lineHeight: 1.4, fontWeight: 600 },
    h4: { fontSize: "14px", lineHeight: 1.4, fontWeight: 600 },
    h5: { fontSize: "13.5px", lineHeight: 1.4, fontWeight: 600 },
    h6: { fontSize: "13px", lineHeight: 1.4, fontWeight: 600 },
    body1: { fontSize: "13px", lineHeight: 1.45 },
    body2: { fontSize: "12px", lineHeight: 1.45 },
    caption: { fontSize: "11px", lineHeight: 1.4 },
    button: { fontSize: "12.5px", fontWeight: 500, textTransform: "none" },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: "#f6f8fa", color: "#202223", fontSize: "13px" },
        "*::selection": { backgroundColor: "#e7f1ff" },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          color: "#202223",
          backgroundColor: "#ffffff",
          boxShadow: "none",
          borderBottom: "1px solid #dfe3e8",
        },
      },
    },
    MuiToolbar: { styleOverrides: { root: { minHeight: "48px !important", height: 48 } } },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: "#f6f8fa", borderColor: "#dfe3e8" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderColor: "#dfe3e8", borderRadius: 8 },
      },
    },
    MuiCard: { styleOverrides: { root: { borderRadius: 8, borderColor: "#dfe3e8", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" } } },
    MuiButton: {
      styleOverrides: {
        root: { minHeight: 32, borderRadius: 6, fontSize: "12.5px", fontWeight: 500, boxShadow: "none" },
        contained: {
          boxShadow: "none",
          backgroundColor: "#0060df",
          "&:hover": { backgroundColor: "#004ecc", boxShadow: "none" },
        },
        outlined: {
          borderColor: "#c4cdd5",
          "&:hover": { borderColor: "#919eab", backgroundColor: "#f6f8fa" },
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 6 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: "#ffffff",
          fontSize: "13px",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "#c4cdd5" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#919eab" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 1, borderColor: "#0060df" },
        },
        input: { padding: "7px 12px", height: "auto" },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 36 },
        indicator: { height: 2, borderRadius: 2, backgroundColor: "#0060df" },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { minHeight: 36, fontSize: "12.5px", textTransform: "none", fontWeight: 500 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { color: "#637381", backgroundColor: "#f9fafb", fontWeight: 600, fontSize: "12px", borderBottom: "1px solid #dfe3e8", padding: "8px 14px" },
        root: { borderColor: "#dfe3e8", fontSize: "12.5px", padding: "10px 14px" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 12, height: 22, fontSize: "11px", fontWeight: 500 },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 8, boxShadow: "0 12px 32px rgb(0 0 0 / 12%)" } } },
  },
});

export default theme;
