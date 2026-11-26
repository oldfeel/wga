import { lazy, Suspense, useEffect } from "react";
import { Link as RouterLink, Navigate, Route, Routes } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { api } from "./api";
import { useAuth } from "./auth";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const GuildPage = lazy(() => import("./pages/GuildPage"));
const AdminGuildPage = lazy(() => import("./pages/AdminGuildPage"));
const CharactersPage = lazy(() => import("./pages/CharactersPage"));
const CharacterDetailPage = lazy(() => import("./pages/CharacterDetailPage"));
const ActivitiesPage = lazy(() => import("./pages/ActivitiesPage"));
const ActivityDetailPage = lazy(() => import("./pages/ActivityDetailPage"));

function PageFallback() {
  return (
    <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
      <CircularProgress size={28} />
    </Box>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "rgba(16,21,28,0.85)", backdropFilter: "blur(8px)" }}>
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Stack direction="row" spacing={1} sx={{ mr: 1, alignItems: "center" }}>
            <Box component="img" src="/wga-logo.png" alt="" width={28} height={28} sx={{ borderRadius: "7px" }} />
            <Typography component={RouterLink} to="/" variant="h6" sx={{ color: "text.primary", textDecoration: "none", fontWeight: 700 }}>
              WGA
            </Typography>
            <Typography variant="body2" color="text.secondary">
              公会助手
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
            <Button component={RouterLink} to="/characters" color="inherit" size="small">
              角色
            </Button>
            <Button component={RouterLink} to="/activities" color="inherit" size="small">
              活动
            </Button>
            <Button component={RouterLink} to="/guild" color="inherit" size="small">
              公会
            </Button>
            {auth.isAdmin ? (
              <Button component={RouterLink} to="/admin/guilds" color="inherit" size="small">
                管理
              </Button>
            ) : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {auth.username}
          </Typography>
          <Button color="inherit" size="small" onClick={auth.logout}>
            退出
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 2.5 }}>
        {children}
      </Container>
    </Box>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.token) return;
    api
      .me(auth.token)
      .then((me) => {
        auth.setGuilds(me.guilds || []);
        auth.setIsAdmin(!!me.user?.is_admin);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);
  if (!auth.token) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function LazyPrivate({ children }: { children: React.ReactNode }) {
  return (
    <Private>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </Private>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <LazyPrivate>
              <Navigate to="/characters" replace />
            </LazyPrivate>
          }
        />
        <Route path="/guild" element={<LazyPrivate><GuildPage /></LazyPrivate>} />
        <Route path="/admin/guilds" element={<LazyPrivate><AdminGuildPage /></LazyPrivate>} />
        <Route path="/characters" element={<LazyPrivate><CharactersPage /></LazyPrivate>} />
        <Route path="/characters/:charId" element={<LazyPrivate><CharacterDetailPage /></LazyPrivate>} />
        <Route path="/activities" element={<LazyPrivate><ActivitiesPage /></LazyPrivate>} />
        <Route path="/activities/:activityId" element={<LazyPrivate><ActivityDetailPage /></LazyPrivate>} />
      </Routes>
    </Suspense>
  );
}
