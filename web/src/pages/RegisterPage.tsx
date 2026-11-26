import { useEffect, useState, type FormEvent } from "react";
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

export default function RegisterPage() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadCaptcha() {
    try {
      const c = await api.captcha();
      setCaptchaId(c.captcha_id);
      setCaptchaImg(c.image);
      setCaptchaCode("");
    } catch (ex) {
      setCaptchaImg("");
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  useEffect(() => {
    loadCaptcha();
  }, []);

  if (auth.token) return <Navigate to="/characters" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const data = await api.register(
        username.trim(),
        password,
        username.trim(),
        captchaId,
        captchaCode.trim()
      );
      auth.setSession(data.token, data.user.username, data.user.is_admin);
      const me = await api.me(data.token);
      auth.setGuilds(me.guilds || []);
      auth.setIsAdmin(!!me.user?.is_admin);
      if (me.guilds?.[0]) auth.setGuildId(me.guilds[0].id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
      await loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
      <Paper component="form" onSubmit={submit} sx={{ width: "min(400px, 100%)", p: 3 }}>
        <Typography variant="h5" gutterBottom>
          注册
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          创建 WGA 账号
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
            slotProps={{ htmlInput: { minLength: 3 } }}
          />
          <TextField
            label="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            size="small"
            slotProps={{ htmlInput: { minLength: 6 } }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">
              验证码
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, mb: 1, alignItems: "center" }}>
              {captchaImg ? (
                <Box
                  component="img"
                  src={captchaImg}
                  alt="验证码"
                  width={140}
                  height={48}
                  title="点击刷新"
                  onClick={loadCaptcha}
                  sx={{ borderRadius: 1, border: 1, borderColor: "divider", cursor: "pointer" }}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  加载中…
                </Typography>
              )}
              <Button type="button" variant="outlined" size="small" onClick={loadCaptcha} disabled={busy}>
                刷新
              </Button>
            </Stack>
            <TextField
              value={captchaCode}
              onChange={(e) => setCaptchaCode(e.target.value)}
              placeholder="输入图中字符"
              required
              fullWidth
              size="small"
              autoComplete="off"
            />
          </Box>
          {err ? <Alert severity="error">{err}</Alert> : null}
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Button type="submit" variant="contained" disabled={busy}>
              注册
            </Button>
            <Link component={RouterLink} to="/login" color="text.secondary">
              去登录
            </Link>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
