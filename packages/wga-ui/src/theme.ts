import { createTheme } from "@mui/material/styles";

/** 与现有 web/desktop CSS 变量对齐的暗色主题 */
export const wgaTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#3d9b6e" },
    secondary: { main: "#2f6f9a" },
    error: { main: "#e08a8a" },
    background: {
      default: "#10151c",
      paper: "#1a222d",
    },
    text: {
      primary: "#e8eef6",
      secondary: "#95a6b8",
    },
    divider: "#2a3544",
  },
  typography: {
    fontFamily:
      '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(1000px 480px at 0% -10%, #1c3a2e 0%, transparent 55%), radial-gradient(800px 400px at 100% 0%, #172636 0%, transparent 50%), #10151c",
          minHeight: "100vh",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid #2a3544",
        },
      },
    },
  },
});
