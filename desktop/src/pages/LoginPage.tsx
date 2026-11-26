import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useConfig } from "../config";
import { api } from "../tauri";

export default function LoginPage() {
  const { refresh } = useConfig();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api.login(username.trim(), password);
      await refresh();
      navigate("/");
    } catch (ex) {
      setErr("登录失败: " + String(ex));
    }
  }

  return (
    <Paper component="form" onSubmit={submit} sx={{ maxWidth: 420, mx: "auto", p: 2.5 }}>
      <Typography variant="h6" gutterBottom>
        登录
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        使用自建 API 账号
      </Typography>
      <Stack spacing={1.5}>
        <TextField
          label="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          size="small"
          fullWidth
        />
        <TextField
          label="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          size="small"
          fullWidth
        />
        {err ? <Alert severity="error">{err}</Alert> : null}
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained">
            登录
          </Button>
          <Button type="button" onClick={() => navigate("/")}>
            返回
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          没有账号？{" "}
          <Link component={RouterLink} to="/register">
            去注册
          </Link>
        </Typography>
      </Stack>
    </Paper>
  );
}
