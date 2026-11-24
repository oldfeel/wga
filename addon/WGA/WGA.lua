--[[
  WGA — WoW Guild Assistant (Forever)
  仅写本地 SavedVariables，无网络请求。
  免责：非官方工具，账号风险使用者自担；禁止有偿代练、交易。
]]

local ADDON_NAME = ...
WGA = WGA or {}
WGA.VERSION = "0.1.0"

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("PLAYER_LOGOUT")

frame:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
    WGADB = WGADB or {}
    WGADB.snapshots = WGADB.snapshots or {}
    WGADB.last = WGADB.last or nil
    WGADB.disclaimer_seen = WGADB.disclaimer_seen or false
  else  if event == "PLAYER_LOGIN" then
    -- silent on login; use /wga help for commands
  elseif event == "PLAYER_LOGOUT" then
    -- 登出时再采一次，方便桌面端读最新 SV
    if WGA.CaptureSnapshot then
      pcall(WGA.CaptureSnapshot, false)
    end
  end
end)

SLASH_WGA1 = "/wga"
SlashCmdList["WGA"] = function(msg)
  msg = (msg or ""):lower():match("^%s*(.-)%s*$")
  if msg == "" or msg == "help" then
    print("|cff33ff99WGA|r /wga snapshot — 采集当前角色快照到 SavedVariables")
    print("|cff33ff99WGA|r /wga last — 打印最近一次快照摘要")
    print("|cff33ff99WGA|r /wga export — 将最近快照的 JSON 字符串打印到聊天（可复制）")
    return
  end
  if msg == "snapshot" or msg == "snap" then
    local ok, err = pcall(WGA.CaptureSnapshot, true)
    if not ok then
      print("|cffff6666WGA|r 采集失败: " .. tostring(err))
    end
    return
  end
  if msg == "last" then
    local last = WGADB and WGADB.last
    if not last or not last.character then
      print("|cff33ff99WGA|r 尚无快照，先执行 /wga snapshot")
      return
    end
    local c = last.character
    print(string.format(
      "|cff33ff99WGA|r %s-%s  Lv%d %s/%s  ilvl=%s  @ %s",
      tostring(c.name), tostring(c.realm), tonumber(c.level) or 0,
      tostring(c.class), tostring(c.spec),
      tostring(c.item_level or "?"),
      tostring(last.captured_at or "?")
    ))
    return
  end
  if msg == "export" then
    if not WGADB or not WGADB.last_json or WGADB.last_json == "" then
      print("|cff33ff99WGA|r 无 JSON，先 /wga snapshot")
      return
    end
    -- 聊天有长度限制，分段打印
    local json = WGADB.last_json
    local chunk = 210
    print("|cff33ff99WGA|r ----- JSON BEGIN -----")
    for i = 1, #json, chunk do
      print(json:sub(i, i + chunk - 1))
    end
    print("|cff33ff99WGA|r ----- JSON END -----")
    return
  end
  print("|cff33ff99WGA|r 未知命令，输入 /wga help")
end
