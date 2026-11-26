import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { wgaTheme } from "@wga/ui";
import App from "./App";
import { ConfigProvider } from "./config";
import "./styles.css";

import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={wgaTheme}>
    <CssBaseline />
    <BrowserRouter>
      <ConfigProvider>
        <App />
      </ConfigProvider>
    </BrowserRouter>
  </ThemeProvider>
);
