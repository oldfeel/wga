import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Link as RouterLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SettingsIcon from "@mui/icons-material/Settings";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useConfig } from "./config";
import { homeRefreshBound, runHomeRefresh } from "./homeRefresh";
import { pushLog } from "./log";
import { api, listen } from "./tauri";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HomePage = lazy(() => import("./pages/HomePage"));

function PageFallback() {
  return (
    <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
      <CircularProgress size={28} />
    </Box>
  );
}

function DesktopEvents() {
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    let dead = false;
    const offs: Array<() => void> = [];
    listen<{ level: string; message: string }>("wga-log", (p) => {
      pushLog(p.level, p.message);
    }).then((off) => {
      if (dead) off();
      else offs.push(off);
    });
    listen<{ path: string }>("wga-sv-changed", async (p) => {
      pushLog("info", `检测到变更: ${p.path}`);
      if (pathRef.current !== "/" || !homeRefreshBound()) {
        pushLog("error", "请先回到主页再刷新");
        return;
      }
      await runHomeRefresh(p.path);
    }).then((off) => {
      if (dead) off();
      else offs.push(off);
    });
    return () => {
      dead = true;
      offs.forEach((off) => off());
    };
  }, []);

  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const { config, ready, refresh } = useConfig();
  const navigate = useNavigate();
  const loggedIn = !!(config?.has_token && config.username);

  async function logout() {
    await api.logout();
    await refresh();
    navigate("/");
  }

  return (
    <div className="app-frame">
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.75,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          flexWrap: "wrap",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <Box
            component="img"
            src="/wga-logo.png"
            alt=""
            width={28}
            height={28}
            sx={{ borderRadius: "7px" }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            WGA Sync
          </Typography>
          <Typography variant="body2" color="text.secondary">
            公会同步
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => navigate("/settings")}
          >
            设置
          </Button>
          {!ready ? null : loggedIn ? (
            <>
              <Typography sx={{ fontWeight: 600 }}>{config?.username}</Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LogoutIcon />}
                onClick={() => void logout()}
              >
                退出
              </Button>
            </>
          ) : (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LoginIcon />}
                component={RouterLink}
                to="/login"
              >
                登录
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<PersonAddIcon />}
                component={RouterLink}
                to="/register"
              >
                注册
              </Button>
            </>
          )}
        </Stack>
      </Stack>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <DesktopEvents />
      <Shell>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </>
  );
}
