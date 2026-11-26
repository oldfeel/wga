import { useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api } from "../api";
import { useAuth } from "../auth";

export default function LoginPage() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (auth.token) return <Navigate to="/characters" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const data = await api.login(username.trim(), password);
      auth.setSession(
        data.token,
        data.user.username,
        (data.user as { is_admin?: boolean }).is_admin
      );
      const me = await api.me(data.token);
      auth.setGuilds(me.guilds || []);
      auth.setIsAdmin(!!me.user?.is_admin);
      if (me.guilds?.[0] && !auth.guildId) auth.setGuildId(me.guilds[0].id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
      <Paper component="form" onSubmit={submit} sx={{ width: "min(400px, 100%)", p: 3 }}>
        <Typography variant="h5" gutterBottom>
          登录
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          自托管公会助手
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            fullWidth
            size="small"
          />
          <TextField
            label="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            size="small"
            slotProps={{ htmlInput: { minLength: 6 } }}
          />
          {err ? <Alert severity="error">{err}</Alert> : null}
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Button type="submit" variant="contained" disabled={busy}>
              登录
            </Button>
            <Link component={RouterLink} to="/register" color="text.secondary">
              去注册
            </Link>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
