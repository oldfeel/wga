--[[ 小地图按钮 + 简易配置面板 ]]

-- 自定义小地图图标（Media/minimap.tga / .png）
local ICON = "Interface\\AddOns\\WGA\\Media\\minimap"

local function ensureDB()
  WGADB = WGADB or {}
  WGADB.minimap = WGADB.minimap or { angle = 220, hide = false }
  return WGADB.minimap
end

-- 与常见小地图按钮（LibDBIcon）一致：贴在小地图外缘，而不是内环
local minimapShapes = {
  ROUND = { true, true, true, true },
  SQUARE = { false, false, false, false },
  CORNER_TOPLEFT = { false, false, false, true },
  CORNER_TOPRIGHT = { false, false, true, false },
  CORNER_BOTTOMLEFT = { false, true, false, false },
  CORNER_BOTTOMRIGHT = { true, false, false, false },
  SIDE_LEFT = { false, true, false, true },
  SIDE_RIGHT = { true, false, true, false },
  SIDE_TOP = { false, false, true, true },
  SIDE_BOTTOM = { true, true, false, false },
  TRICORNER_TOPLEFT = { false, true, true, true },
  TRICORNER_TOPRIGHT = { true, false, true, true },
  TRICORNER_BOTTOMLEFT = { true, true, false, true },
  TRICORNER_BOTTOMRIGHT = { true, true, true, false },
}

local function updateMinimapPos(btn)
  local db = ensureDB()
  local angle = math.rad(db.angle or 220)
  local x, y = math.cos(angle), math.sin(angle)
  local q = 1
  if x < 0 then q = q + 1 end
  if y > 0 then q = q + 2 end
  local shape = (GetMinimapShape and GetMinimapShape()) or "ROUND"
  local quad = minimapShapes[shape] or minimapShapes.ROUND
  -- +5 把图标中心推到外圈，与系统追踪按钮对齐
  local w = (Minimap:GetWidth() / 2) + 5
  local h = (Minimap:GetHeight() / 2) + 5
  if quad[q] then
    x, y = x * w, y * h
  else
    local diagW = math.sqrt(2 * (w ^ 2)) - 10
    local diagH = math.sqrt(2 * (h ^ 2)) - 10
    x = math.max(-w, math.min(x * diagW, w))
    y = math.max(-h, math.min(y * diagH, h))
  end
  btn:ClearAllPoints()
  btn:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

local config

local function refreshConfig()
  if not config or not config:IsShown() then return end
  local st = WGA.GetAutoState and WGA.GetAutoState() or {}
  if config.autoCheck then
    config.autoCheck:SetChecked(st.enabled and true or false)
  end
  if config.intervalBox then
    config.intervalBox:SetText(tostring(st.interval_min or 2))
  end
  if config.statusText then
    local last = WGADB and WGADB.last
    local lastAt = (last and last.captured_at) or "尚无"
    -- 过长 ISO 截断，避免换行顶到底部提示
    if type(lastAt) == "string" and #lastAt > 22 then
      lastAt = lastAt:sub(1, 19)
    end
    config.statusText:SetText(string.format(
      "待写入：%s    最近快照：%s",
      st.dirty and "是" or "否",
      tostring(lastAt)
    ))
  end
end

local function createConfig()
  if config then return config end

  local f = CreateFrame("Frame", "WGAConfigFrame", UIParent, "BasicFrameTemplateWithInset")
  f:SetSize(340, 300)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
  f:Hide()
  f:SetScript("OnShow", refreshConfig)

  if f.TitleText then
    f.TitleText:SetText("WGA 公会助手")
  else
    local t = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    t:SetPoint("TOP", 0, -6)
    t:SetText("WGA 公会助手")
  end

  local y = -36
  local intro = f:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  intro:SetPoint("TOPLEFT", 16, y)
  intro:SetPoint("TOPRIGHT", -16, y)
  intro:SetJustifyH("LEFT")
  intro:SetText("本地快照 → 桌面端上传。无网络请求。")
  y = y - 28

  local check = CreateFrame("CheckButton", nil, f, "UICheckButtonTemplate")
  check:SetPoint("TOPLEFT", 12, y)
  check:SetScript("OnClick", function(self)
    if WGA.SetAutoEnabled then
      WGA.SetAutoEnabled(self:GetChecked())
    end
    refreshConfig()
  end)
  local checkLabel = f:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  checkLabel:SetPoint("LEFT", check, "RIGHT", 4, 0)
  checkLabel:SetText("有变化后自动保存")
  f.autoCheck = check
  y = y - 36

  local delayLabel = f:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  delayLabel:SetPoint("TOPLEFT", 18, y)
  delayLabel:SetText("延迟写入（分钟）")
  local box = CreateFrame("EditBox", nil, f, "InputBoxTemplate")
  box:SetSize(50, 20)
  box:SetPoint("LEFT", delayLabel, "RIGHT", 12, 0)
  box:SetAutoFocus(false)
  box:SetNumeric(true)
  box:SetMaxLetters(3)
  box:SetScript("OnEnterPressed", function(self)
    local n = tonumber(self:GetText())
    if WGA.SetAutoInterval and n then
      self:SetText(tostring(WGA.SetAutoInterval(n)))
    end
    self:ClearFocus()
    refreshConfig()
  end)
  box:SetScript("OnEditFocusLost", function(self)
    local n = tonumber(self:GetText())
    if WGA.SetAutoInterval and n then
      self:SetText(tostring(WGA.SetAutoInterval(n)))
    end
    refreshConfig()
  end)
  f.intervalBox = box
  y = y - 36

  local snapBtn = CreateFrame("Button", nil, f, "UIPanelButtonTemplate")
  snapBtn:SetSize(120, 24)
  snapBtn:SetPoint("TOPLEFT", 18, y)
  snapBtn:SetText("立即快照")
  snapBtn:SetScript("OnClick", function()
    if WGA.DoSnapshot then
      local ok, err = WGA.DoSnapshot(true)
      if not ok then
        print("|cffff6666WGA|r 采集失败: " .. tostring(err))
      end
    end
    refreshConfig()
  end)
  y = y - 34

  local hideMini = CreateFrame("CheckButton", nil, f, "UICheckButtonTemplate")
  hideMini:SetPoint("TOPLEFT", 12, y)
  hideMini:SetScript("OnClick", function(self)
    local db = ensureDB()
    db.hide = self:GetChecked() and true or false
    if WGAMinimapButton then
      if db.hide then WGAMinimapButton:Hide() else WGAMinimapButton:Show() end
    end
  end)
  local hideLabel = f:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  hideLabel:SetPoint("LEFT", hideMini, "RIGHT", 4, 0)
  hideLabel:SetText("隐藏小地图按钮")
  f.hideMini = hideMini
  y = y - 36

  local tip = f:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  tip:SetPoint("BOTTOMLEFT", 16, 16)
  tip:SetPoint("BOTTOMRIGHT", -16, 16)
  tip:SetJustifyH("LEFT")
  tip:SetJustifyV("BOTTOM")
  tip:SetText("小地图：左键配置 · 右键快照 · 拖拽移动\n命令：/wga config")

  local status = f:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  status:SetPoint("BOTTOMLEFT", tip, "TOPLEFT", 0, 12)
  status:SetPoint("BOTTOMRIGHT", tip, "TOPRIGHT", 0, 12)
  status:SetJustifyH("LEFT")
  status:SetJustifyV("BOTTOM")
  f.statusText = status

  config = f
  return f
end

function WGA.ToggleConfig()
  local f = createConfig()
  if f:IsShown() then
    f:Hide()
  else
    if f.hideMini then
      f.hideMini:SetChecked(ensureDB().hide and true or false)
    end
    f:Show()
    refreshConfig()
  end
end

function WGA.InitUI()
  if WGAMinimapButton then
    updateMinimapPos(WGAMinimapButton)
    if ensureDB().hide then WGAMinimapButton:Hide() else WGAMinimapButton:Show() end
    return
  end

  local btn = CreateFrame("Button", "WGAMinimapButton", Minimap)
  btn:SetSize(32, 32)
  btn:SetFrameStrata("MEDIUM")
  btn:SetFrameLevel(8)
  btn:RegisterForClicks("AnyUp")
  btn:RegisterForDrag("LeftButton")
  btn:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

  local overlay = btn:CreateTexture(nil, "OVERLAY")
  overlay:SetSize(53, 53)
  overlay:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  overlay:SetPoint("TOPLEFT")

  local icon = btn:CreateTexture(nil, "BACKGROUND")
  icon:SetSize(20, 20)
  icon:SetTexture(ICON)
  icon:SetTexCoord(0.05, 0.95, 0.05, 0.95)
  icon:SetPoint("CENTER", 0, 1)
  btn.icon = icon

  btn:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine("WGA 公会助手")
    local st = WGA.GetAutoState and WGA.GetAutoState() or {}
    GameTooltip:AddLine(
      string.format("自动保存：%s（延迟 %d 分）", st.enabled and "开" or "关", st.interval_min or 2),
      0.7, 0.9, 0.7
    )
    GameTooltip:AddLine("左键：配置  右键：立即快照", 0.6, 0.6, 0.6)
    GameTooltip:AddLine("拖拽：移动按钮", 0.6, 0.6, 0.6)
    GameTooltip:Show()
  end)
  btn:SetScript("OnLeave", function()
    GameTooltip:Hide()
  end)

  btn:SetScript("OnClick", function(_, button)
    if button == "RightButton" then
      if WGA.DoSnapshot then
        local ok, err = WGA.DoSnapshot(true)
        if not ok then
          print("|cffff6666WGA|r 采集失败: " .. tostring(err))
        end
      end
    else
      WGA.ToggleConfig()
    end
  end)

  btn:SetScript("OnDragStart", function(self)
    self:LockHighlight()
    self:SetScript("OnUpdate", function(self)
      local mx, my = GetCursorPosition()
      local cx, cy = Minimap:GetCenter()
      local scale = Minimap:GetEffectiveScale()
      local db = ensureDB()
      db.angle = math.deg(math.atan2(my / scale - cy, mx / scale - cx))
      updateMinimapPos(self)
    end)
  end)
  btn:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
    self:UnlockHighlight()
  end)

  updateMinimapPos(btn)
  if ensureDB().hide then
    btn:Hide()
  else
    btn:Show()
  end
end
