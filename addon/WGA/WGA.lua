--[[
  WGA — WoW Guild Assistant (Forever)
  仅写本地 SavedVariables，无网络请求。
  免责：非官方工具，账号风险使用者自担；禁止有偿代练、交易。
]]

local ADDON_NAME = ...
WGA = WGA or {}
WGA.VERSION = "0.1.29"

local DEFAULT_AUTO_MINUTES = 2
local MIN_AUTO_MINUTES = 1
local MAX_AUTO_MINUTES = 120
local POLL_SEC = 30

local pollTicker = nil
local capturing = false
local dirty = false
local dirtyAt = 0

local function now()
  return (GetTime and GetTime()) or 0
end

local function defaults()
  WGADB = WGADB or {}
  WGADB.snapshots = nil
  WGADB.last = WGADB.last or nil
  WGADB.disclaimer_seen = WGADB.disclaimer_seen or false
  if WGADB.auto_save == nil then
    WGADB.auto_save = true
  end
  if type(WGADB.auto_interval_min) ~= "number" then
    WGADB.auto_interval_min = DEFAULT_AUTO_MINUTES
  end
  -- 旧默认 10：改为「变化后延迟」语义后，过大则降到 2
  if WGADB.auto_interval_min == 10 and WGADB.auto_debounce_migrated ~= true then
    WGADB.auto_interval_min = DEFAULT_AUTO_MINUTES
    WGADB.auto_debounce_migrated = true
  end
  WGADB.auto_interval_min = math.max(
    MIN_AUTO_MINUTES,
    math.min(MAX_AUTO_MINUTES, WGADB.auto_interval_min)
  )
  if WGADB.minimap == nil then
    WGADB.minimap = { angle = 220, hide = false }
  end
  if type(WGADB.minimap.angle) ~= "number" then
    WGADB.minimap.angle = 220
  end
  -- 手动快照后自动 ReloadUI，把 SavedVariables 刷到磁盘（插件无法任意写文件）
  if WGADB.auto_reload_on_snap == nil then
    WGADB.auto_reload_on_snap = true
  end
end

--- 客户端禁止插件随意写盘；SavedVariables 只在登出 / ReloadUI 时落盘
function WGA.FlushToDisk(reason)
  defaults()
  print(string.format(
    "|cff33ff99WGA|r 正在刷新界面以写入磁盘%s…",
    reason and ("（" .. tostring(reason) .. "）") or ""
  ))
  if C_UI and C_UI.Reload then
    C_UI.Reload()
  elseif ReloadUI then
    ReloadUI()
  else
    print("|cffff6666WGA|r 无法 ReloadUI，请手动 /reload")
  end
end

function WGA.ShouldReloadAfterSnap()
  defaults()
  return WGADB.auto_reload_on_snap ~= false
end

local function markDirty(reason)
  dirty = true
  dirtyAt = now()
  WGA._dirty_reason = reason
end

local function stopAuto()
  if pollTicker then
    pollTicker:Cancel()
    pollTicker = nil
  end
end

local function runAutoCapture()
  if capturing or not WGA.CaptureSnapshot then return end
  if not UnitIsConnected or not UnitIsConnected("player") then return end
  -- 战斗中不自动写，避免卡顿感
  if InCombatLockdown and InCombatLockdown() then return end
  if UnitAffectingCombat and UnitAffectingCombat("player") then return end

  capturing = true
  local ok, snapOrErr, why = pcall(WGA.CaptureSnapshot, {
    announce = false,
    force = false,
    skip_unchanged = true,
  })
  capturing = false

  if not ok then
    print("|cffff6666WGA|r 自动快照失败: " .. tostring(snapOrErr))
    return
  end
  dirty = false
  if snapOrErr == nil and why == "unchanged" then
    return
  end
  -- 静默成功；需要时可 /wga last
end

local function onPoll()
  if not WGADB or not WGADB.auto_save then return end
  if not dirty then return end
  local waitMin = WGADB.auto_interval_min or DEFAULT_AUTO_MINUTES
  if (now() - dirtyAt) < (waitMin * 60) then
    return -- 变化后仍在抖动窗口内，合并为一次保存
  end
  runAutoCapture()
end

local function startAuto()
  stopAuto()
  defaults()
  if not WGADB.auto_save then return end
  if C_Timer and C_Timer.NewTicker then
    pollTicker = C_Timer.NewTicker(POLL_SEC, onPoll)
  end
end

local DIRTY_EVENTS = {
  "PLAYER_EQUIPMENT_CHANGED",
  "PLAYER_AVG_ITEM_LEVEL_UPDATE",
  "PLAYER_SPECIALIZATION_CHANGED",
  "QUEST_LOG_UPDATE",
  "UNIT_QUEST_LOG_CHANGED",
  "UPDATE_INSTANCE_INFO",
  "SKILL_LINES_CHANGED",
  "TRANSMOG_COLLECTION_UPDATED",
  "PLAYER_TRANSMOG_OUTFIT_CHANGED",
  "TRANSMOG_OUTFIT_APPLIED",
}

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("PLAYER_LOGOUT")
frame:RegisterEvent("PLAYER_REGEN_ENABLED")
for _, ev in ipairs(DIRTY_EVENTS) do
  pcall(frame.RegisterEvent, frame, ev)
end

frame:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
    defaults()
  elseif event == "PLAYER_LOGIN" then
    defaults()
    markDirty("login")
    startAuto()
    if WGA.InitUI then
      pcall(WGA.InitUI)
    end
    if WGADB.auto_save then
      print(string.format(
        "|cff33ff99WGA|r 自动快照：有变化后约 %d 分钟写入。小地图按钮可配置（或 /wga）。",
        WGADB.auto_interval_min or DEFAULT_AUTO_MINUTES
      ))
    end
  elseif event == "PLAYER_LOGOUT" then
    stopAuto()
    if WGA.CaptureSnapshot then
      pcall(WGA.CaptureSnapshot, {
        announce = false,
        force = true,
        skip_unchanged = false,
      })
    end
  elseif event == "PLAYER_REGEN_ENABLED" then
    -- 脱战后若仍 dirty，由 poll 处理；此处加速一次检查窗口
    if dirty then dirtyAt = math.min(dirtyAt, now() - ((WGADB.auto_interval_min or DEFAULT_AUTO_MINUTES) * 60)) end
  elseif event == "UNIT_QUEST_LOG_CHANGED" then
    if arg1 == "player" then markDirty(event) end
  else
    -- 其余已注册的脏事件
    for _, ev in ipairs(DIRTY_EVENTS) do
      if event == ev then
        markDirty(event)
        break
      end
    end
  end
end)

SLASH_WGA1 = "/wga"
SlashCmdList["WGA"] = function(msg)
  msg = (msg or ""):lower():match("^%s*(.-)%s*$")
  if msg == "" or msg == "help" then
    print("|cff33ff99WGA|r /wga snapshot — 立即采集并刷新界面写入磁盘")
    print("|cff33ff99WGA|r /wga snapshot noreload — 只采集到内存，不 Reload")
    print("|cff33ff99WGA|r /wga config — 打开配置面板（同小地图左键）")
    print("|cff33ff99WGA|r /wga auto — 查看自动状态")
    print("|cff33ff99WGA|r /wga auto on|off — 开关")
    print("|cff33ff99WGA|r /wga auto 2 — 变化后延迟写入的分钟数（1–120）")
    print("|cff33ff99WGA|r /wga flush on|off — 手动快照后是否自动 Reload（默认 on）")
    print("|cff33ff99WGA|r /wga last — 最近快照摘要")
    print("|cff33ff99WGA|r /wga export — 打印最近 JSON")
    return
  end
  if msg == "config" or msg == "ui" or msg == "options" then
    if WGA.ToggleConfig then
      WGA.ToggleConfig()
    else
      print("|cffff6666WGA|r 配置界面未加载")
    end
    return
  end
  if msg == "snapshot" or msg == "snap" or msg:match("^snapshot%s") or msg:match("^snap%s") then
    local arg = msg:match("^snap%w*%s+(.+)$")
    local noReload = arg == "noreload" or arg == "nr"
    local ok, err = pcall(WGA.CaptureSnapshot, {
      announce = true,
      force = true,
      skip_unchanged = false,
      will_reload = (not noReload) and WGA.ShouldReloadAfterSnap(),
    })
    if not ok then
      print("|cffff6666WGA|r 采集失败: " .. tostring(err))
      return
    end
    dirty = false
    if (not noReload) and WGA.ShouldReloadAfterSnap() then
      WGA.FlushToDisk("手动快照")
    end
    return
  end
  if msg == "flush" or msg:match("^flush%s") then
    defaults()
    local arg = msg:match("^flush%s+(.+)$")
    if arg == "on" or arg == "1" or arg == "true" then
      WGADB.auto_reload_on_snap = true
      print("|cff33ff99WGA|r 手动快照后将自动 Reload 写入磁盘")
      return
    end
    if arg == "off" or arg == "0" or arg == "false" then
      WGADB.auto_reload_on_snap = false
      print("|cff33ff99WGA|r 已关闭自动 Reload；快照后需自行 /reload")
      return
    end
    print(string.format(
      "|cff33ff99WGA|r 快照后自动 Reload：%s（/wga flush on|off）",
      WGADB.auto_reload_on_snap ~= false and "开" or "关"
    ))
    return
  end
  if msg == "auto" or msg:match("^auto%s") then
    defaults()
    local arg = msg:match("^auto%s+(.+)$")
    if not arg then
      print(string.format(
        "|cff33ff99WGA|r 自动：%s；变化后延迟 %d 分钟；当前待写入：%s",
        WGADB.auto_save and "开" or "关",
        WGADB.auto_interval_min or DEFAULT_AUTO_MINUTES,
        dirty and "是" or "否"
      ))
      return
    end
    if arg == "on" or arg == "1" or arg == "true" then
      WGADB.auto_save = true
      markDirty("manual_on")
      startAuto()
      print(string.format(
        "|cff33ff99WGA|r 已开启：有变化后约 %d 分钟写入",
        WGADB.auto_interval_min
      ))
      return
    end
    if arg == "off" or arg == "0" or arg == "false" then
      WGADB.auto_save = false
      stopAuto()
      dirty = false
      print("|cff33ff99WGA|r 已关闭自动快照")
      return
    end
    local minutes = tonumber(arg)
    if minutes then
      minutes = math.floor(minutes + 0.5)
      if minutes < MIN_AUTO_MINUTES or minutes > MAX_AUTO_MINUTES then
        print(string.format(
          "|cffff6666WGA|r 延迟需在 %d–%d 分钟",
          MIN_AUTO_MINUTES, MAX_AUTO_MINUTES
        ))
        return
      end
      WGADB.auto_interval_min = minutes
      WGADB.auto_debounce_migrated = true
      if WGADB.auto_save then
        startAuto()
      end
      print(string.format("|cff33ff99WGA|r 变化后延迟已设为 %d 分钟", minutes))
      return
    end
    print("|cffff6666WGA|r 用法：/wga auto on|off|<分钟>")
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

-- 供小地图 / 配置面板调用
function WGA.GetAutoState()
  defaults()
  return {
    enabled = WGADB.auto_save and true or false,
    interval_min = WGADB.auto_interval_min or DEFAULT_AUTO_MINUTES,
    dirty = dirty and true or false,
    min_interval = MIN_AUTO_MINUTES,
    max_interval = MAX_AUTO_MINUTES,
  }
end

function WGA.SetAutoEnabled(on)
  defaults()
  WGADB.auto_save = on and true or false
  if WGADB.auto_save then
    markDirty("ui")
    startAuto()
  else
    stopAuto()
    dirty = false
  end
end

function WGA.SetAutoInterval(minutes)
  defaults()
  minutes = math.floor(tonumber(minutes) or DEFAULT_AUTO_MINUTES)
  minutes = math.max(MIN_AUTO_MINUTES, math.min(MAX_AUTO_MINUTES, minutes))
  WGADB.auto_interval_min = minutes
  WGADB.auto_debounce_migrated = true
  if WGADB.auto_save then
    startAuto()
  end
  return minutes
end

function WGA.DoSnapshot(announce)
  local willReload = WGA.ShouldReloadAfterSnap()
  local ok, err = pcall(WGA.CaptureSnapshot, {
    announce = announce ~= false,
    force = true,
    skip_unchanged = false,
    will_reload = willReload,
  })
  if ok then
    dirty = false
    if willReload then
      -- 按钮点击属于硬件事件，允许 ReloadUI
      WGA.FlushToDisk("手动快照")
    end
  end
  return ok, err
end
