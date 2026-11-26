import { useEffect, useState, type FormEvent } from "react";
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

export default function RegisterPage() {
  const { refresh } = useConfig();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [image, setImage] = useState("");
  const [alt, setAlt] = useState("验证码");
  const [err, setErr] = useState("");

  async function loadCaptcha() {
    try {
      const data = await api.getCaptcha();
      setCaptchaId(data.captcha_id);
      setImage(data.image);
      setAlt("验证码");
    } catch {
      setCaptchaId("");
      setImage("");
      setAlt("获取失败，点击刷新");
    }
  }

  useEffect(() => {
    void loadCaptcha();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const u = username.trim();
    try {
      await api.register({
        username: u,
        password,
        displayName: u,
        captchaId,
        captchaCode: code.trim(),
      });
      await refresh();
      navigate("/");
    } catch (ex) {
      setErr("注册失败: " + String(ex));
      await loadCaptcha();
    }
  }

  return (
    <Paper component="form" onSubmit={submit} sx={{ maxWidth: 420, mx: "auto", p: 2.5 }}>
      <Typography variant="h6" gutterBottom>
        注册
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        创建账号后可同步快照到自建 API
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
          autoComplete="new-password"
          size="small"
          fullWidth
        />
        <div>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            验证码
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
            <img
              className="captcha-img"
              width={140}
              height={48}
              alt={alt}
              title="点击刷新"
              src={image || undefined}
              onClick={() => void loadCaptcha()}
            />
            <Button type="button" variant="outlined" size="small" onClick={() => void loadCaptcha()}>
              刷新
            </Button>
          </Stack>
          <TextField
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="输入图中字符"
            autoComplete="off"
            size="small"
            fullWidth
          />
        </div>
        {err ? <Alert severity="error">{err}</Alert> : null}
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained">
            注册
          </Button>
          <Button type="button" onClick={() => navigate("/")}>
            返回
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          已有账号？{" "}
          <Link component={RouterLink} to="/login">
            去登录
          </Link>
        </Typography>
      </Stack>
    </Paper>
  );
}
