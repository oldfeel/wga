import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useConfig } from "../config";
import { api } from "../tauri";

export default function SettingsPage() {
  const { config, refresh } = useConfig();
  const navigate = useNavigate();
  const [apiBase, setApiBase] = useState("");
  const [wowRoot, setWowRoot] = useState("");
  const [autoUpload, setAutoUpload] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!config) return;
    setApiBase(config.api_base_url);
    setWowRoot(config.wow_root);
    setAutoUpload(config.auto_upload);
  }, [config]);

  async function save() {
    await api.saveSettings(apiBase.trim(), autoUpload);
    await refresh();
    setMsg("已保存");
  }

  async function pick() {
    await api.pickWowRoot();
    await refresh();
  }

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="h6">连接</Typography>
        <Button onClick={() => navigate("/")}>返回</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        配置 API 与无限服目录，供快照同步使用。
      </Typography>
      <Stack spacing={1.5}>
        <TextField
          label="API 地址"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          size="small"
          fullWidth
        />
        <Stack direction="row" spacing={1}>
          <TextField
            label="无限服目录"
            value={wowRoot}
            size="small"
            fullWidth
            slotProps={{ input: { readOnly: true } }}
          />
          <Button variant="contained" onClick={() => void pick()} sx={{ flexShrink: 0 }}>
            浏览
          </Button>
        </Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={autoUpload}
              onChange={(e) => setAutoUpload(e.target.checked)}
            />
          }
          label="自动上传"
        />
        <Button variant="contained" onClick={() => void save()} sx={{ alignSelf: "flex-start" }}>
          保存设置
        </Button>
        {msg ? (
          <Typography variant="body2" color="text.secondary">
            {msg}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}
