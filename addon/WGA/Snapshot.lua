--[[ 采集角色快照 → WGADB（SavedVariables）+ last_json 字符串 ]]

local SLOT_MAP = {
  {1, "HEAD"}, {2, "NECK"}, {3, "SHOULDER"}, {5, "CHEST"},
  {6, "WAIST"}, {7, "LEGS"}, {8, "FEET"}, {9, "WRIST"},
  {10, "HANDS"}, {11, "FINGER1"}, {12, "FINGER2"},
  {13, "TRINKET1"}, {14, "TRINKET2"}, {15, "BACK"},
  {16, "MAINHAND"}, {17, "OFFHAND"},
}

local function esc(s)
  if s == nil then return "null" end
  s = tostring(s)
  s = s:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r")
  return '"' .. s .. '"'
end

local function enc(v)
  local t = type(v)
  if v == nil then return "null" end
  if t == "boolean" then return v and "true" or "false" end
  if t == "number" then return tostring(v) end
  if t == "string" then return esc(v) end
  if t == "table" then
    -- array if consecutive integer keys from 1
    local n = #v
    local isArr = true
    local count = 0
    for k in pairs(v) do
      count = count + 1
      if type(k) ~= "number" then isArr = false end
    end
    if isArr and count == n then
      local parts = {}
      for i = 1, n do parts[i] = enc(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for k, val in pairs(v) do
      parts[#parts + 1] = esc(tostring(k)) .. ":" .. enc(val)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

local function isoNow()
  -- WoW 无标准时区；用本地日期时间近似 ISO
  local d = C_DateAndTime and C_DateAndTime.GetCurrentCalendarTime and C_DateAndTime.GetCurrentCalendarTime()
  if d and d.year then
    return string.format("%04d-%02d-%02dT%02d:%02d:%02d", d.year, d.month, d.monthDay, d.hour or 0, d.minute or 0, 0)
  end
  return date("!%Y-%m-%dT%H:%M:%SZ")
end

local function getSpecName()
  local specIndex = GetSpecialization and GetSpecialization()
  if not specIndex then return "" end
  local _, name = GetSpecializationInfo(specIndex)
  return name or ""
end

local function getItemLevel()
  if GetAverageItemLevel then
    local avg = GetAverageItemLevel()
    if avg and avg > 0 then return tonumber(string.format("%.1f", avg)) end
  end
  return nil
end

local function sourceName(sourceID)
  if not sourceID or sourceID <= 0 then return nil end
  if C_TransmogCollection and C_TransmogCollection.GetSourceInfo then
    local ok, info = pcall(C_TransmogCollection.GetSourceInfo, sourceID)
    if ok and type(info) == "table" and info.name then
      return info.name, info.visualID
    end
  end
  return nil, nil
end

local function illusionName(illusionID)
  if not illusionID or illusionID <= 0 then return nil end
  if C_TransmogCollection and C_TransmogCollection.GetIllusionInfo then
    local ok, info = pcall(C_TransmogCollection.GetIllusionInfo, illusionID)
    if ok and type(info) == "table" then return info.name end
  end
  if C_TransmogCollection and C_TransmogCollection.GetIllusionSourceInfo then
    local ok, name = pcall(C_TransmogCollection.GetIllusionSourceInfo, illusionID)
    if ok and type(name) == "string" then return name end
  end
  return nil
end

-- 当前穿着外观（非全收集图鉴）
local function collectSlotTransmog(slotId)
  local tm = {
    source_id = nil,
    appearance_id = nil,
    name = nil,
    is_transmogrified = false,
    is_hidden = false,
    illusion_id = nil,
    illusion_name = nil,
  }
  if not C_Transmog or not TransmogUtil or not Enum or not Enum.TransmogType then
    return tm
  end
  local modMain = Enum.TransmogModification and Enum.TransmogModification.Main or 0

  local okLoc, loc = pcall(
    TransmogUtil.GetTransmogLocation,
    slotId,
    Enum.TransmogType.Appearance,
    modMain
  )
  if okLoc and loc and C_Transmog.GetSlotVisualInfo then
    local ok, baseSourceID, baseVisualID, appliedSourceID, appliedVisualID =
      pcall(C_Transmog.GetSlotVisualInfo, loc)
    if ok then
      baseSourceID = tonumber(baseSourceID) or 0
      baseVisualID = tonumber(baseVisualID) or 0
      appliedSourceID = tonumber(appliedSourceID) or 0
      appliedVisualID = tonumber(appliedVisualID) or 0
      local src = appliedSourceID > 0 and appliedSourceID or baseSourceID
      local vis = appliedVisualID > 0 and appliedVisualID or baseVisualID
      tm.source_id = src > 0 and src or nil
      tm.appearance_id = vis > 0 and vis or nil
      tm.is_transmogrified = appliedSourceID > 0 and appliedSourceID ~= baseSourceID
      local n, visualFromSrc = sourceName(src)
      tm.name = n
      if (not tm.appearance_id or tm.appearance_id == 0) and visualFromSrc then
        tm.appearance_id = visualFromSrc
      end
    end
  end

  if okLoc and loc and C_Transmog.GetSlotInfo then
    local okInfo, _, _, _, _, _, isHideVisual = pcall(C_Transmog.GetSlotInfo, loc)
    if okInfo and isHideVisual then
      tm.is_hidden = true
    end
  end

  -- 武器幻化特效
  if (slotId == 16 or slotId == 17) and Enum.TransmogType.Illusion then
    local okI, iloc = pcall(
      TransmogUtil.GetTransmogLocation,
      slotId,
      Enum.TransmogType.Illusion,
      modMain
    )
    if okI and iloc and C_Transmog.GetSlotVisualInfo then
      local okV, _, _, appliedSourceID, appliedVisualID =
        pcall(C_Transmog.GetSlotVisualInfo, iloc)
      if okV then
        local iid = tonumber(appliedVisualID) or tonumber(appliedSourceID) or 0
        if iid > 0 then
          tm.illusion_id = iid
          tm.illusion_name = illusionName(iid)
        end
      end
    end
  end

  return tm
end

-- 《无限》优先 C_Item.*：旧全局 GetItemInfo / GetItemIcon 经常拿不到
-- 返回值同 GetItemInfo：name, link, quality, ..., equipLoc, texture, ...
local function itemInfo(item)
  if item == nil then return nil end
  local fn = C_Item and C_Item.GetItemInfo
  if type(fn) == "function" then
    local ok, name, link, quality, a4, a5, a6, a7, a8, a9, a10 = pcall(fn, item)
    if ok and name then
      return name, link, quality, a4, a5, a6, a7, a8, a9, a10
    end
  end
  if type(GetItemInfo) == "function" then
    return GetItemInfo(item)
  end
  return nil
end

-- 返回 icon 文件名（CDN 用）与可选 fileDataID（《无限》常只给数字）
local function normalizeIcon(texture)
  if texture == nil or texture == "" then return nil, nil end
  if type(texture) == "number" then
    return nil, texture
  end
  local s = tostring(texture)
  if s:match("^%d+$") then
    return nil, tonumber(s)
  end
  local name = s:match("([^\\/]+)$") or s
  name = name:gsub("%.[Bb][Ll][Pp]$", ""):gsub("%.[Pp][Nn][Gg]$", ""):gsub("%.[Jj][Pp][Gg]$", "")
  if name == "" then return nil, nil end
  name = string.lower(name)
  -- 误采到 INVTYPE_* 部位常量时丢弃
  if name:match("^invtype_") then return nil, nil end
  return name, nil
end

local function resolveIcon(itemId, link, slotId)
  local candidates = {}
  local function add(v)
    if v ~= nil and v ~= "" then candidates[#candidates + 1] = v end
  end

  -- 已装备槽位纹理优先（常为 Interface\Icons\xxx 路径）
  if type(GetInventoryItemTexture) == "function" and slotId then
    local ok, v = pcall(GetInventoryItemTexture, "player", slotId)
    if ok then add(v) end
  end
  -- 《无限》推荐：C_Item.GetItemIconByID（可能是 fileId 数字）
  if C_Item and C_Item.GetItemIconByID and itemId then
    local ok, v = pcall(C_Item.GetItemIconByID, itemId)
    if ok then add(v) end
  end
  if type(GetItemIcon) == "function" and itemId then
    local ok, v = pcall(GetItemIcon, itemId)
    if ok then add(v) end
  end
  -- Instant：pcall 多一个 ok；函数第 5 返回值才是 icon（GearInsight 同序）
  local instant = (C_Item and C_Item.GetItemInfoInstant) or GetItemInfoInstant
  if type(instant) == "function" and (itemId or link) then
    local ok, _, _, _, _, icon = pcall(instant, itemId or link)
    if ok then add(icon) end
  end
  if link then
    local _, _, _, _, _, _, _, _, _, tex = itemInfo(link)
    add(tex)
  end

  -- 同时收集：优先可用的图标文件名 + 任意 fileDataID
  local bestName, fileId = nil, nil
  for i = 1, #candidates do
    local name, fid = normalizeIcon(candidates[i])
    if name and not bestName then bestName = name end
    if fid and not fileId then fileId = fid end
  end
  return bestName, fileId
end

local function itemDesc(link, itemSubType, equipLoc)
  local parts = {}
  if itemSubType and itemSubType ~= "" then parts[#parts + 1] = itemSubType end
  if equipLoc and _G and _G[equipLoc] then
    parts[#parts + 1] = _G[equipLoc]
  elseif equipLoc and equipLoc ~= "" then
    parts[#parts + 1] = equipLoc
  end
  -- 额外从链接 tip 抽一行绑定信息（失败则忽略）
  if link and C_TooltipInfo and C_TooltipInfo.GetHyperlink then
    local ok, data = pcall(C_TooltipInfo.GetHyperlink, link)
    if ok and data and data.lines then
      for _, line in ipairs(data.lines) do
        local t = line.leftText
        if t and (t:find("绑定") or t:find("Bound") or t:find("装备后")) then
          parts[#parts + 1] = t
          break
        end
      end
    end
  end
  if #parts == 0 then return nil end
  return table.concat(parts, " · ")
end

local function collectEquipment()
  local list = {}
  for _, pair in ipairs(SLOT_MAP) do
    local slotId, slotName = pair[1], pair[2]
    local link = GetInventoryItemLink("player", slotId)
    if link then
      local itemId = GetInventoryItemID("player", slotId)
      if C_Item and C_Item.RequestLoadItemDataByID and itemId then
        pcall(C_Item.RequestLoadItemDataByID, itemId)
      end
      local name, _, quality, _, _, _, itemSubType, _, equipLoc = itemInfo(link)
      name = name or link
      local ilvl = nil
      if GetDetailedItemLevelInfo then
        ilvl = GetDetailedItemLevelInfo(link)
      end
      if quality == nil and GetInventoryItemQuality then
        quality = GetInventoryItemQuality("player", slotId)
      end
      local icon, iconFileId = resolveIcon(itemId, link, slotId)
      list[#list + 1] = {
        slot = slotName,
        item_id = itemId,
        name = name,
        item_level = ilvl,
        quality = quality,
        icon = icon,
        icon_file_id = iconFileId,
        desc = itemDesc(link, itemSubType, equipLoc),
        enchant_id = nil,
        gems = {},
        transmog = collectSlotTransmog(slotId),
      }
    else
      -- 空槽也输出，便于英雄榜式布局
      list[#list + 1] = {
        slot = slotName,
        item_id = nil,
        name = nil,
        item_level = nil,
        quality = nil,
        icon = nil,
        icon_file_id = nil,
        desc = nil,
        enchant_id = nil,
        gems = {},
        transmog = nil,
      }
    end
  end
  return list
end

local function collectTalents()
  local loadout = ""
  local specId = nil
  if GetSpecialization then
    local idx = GetSpecialization()
    if idx and GetSpecializationInfo then
      specId = select(1, GetSpecializationInfo(idx))
    end
  end
  -- 零售导出串 API（无限若可用则填）
  if C_Traits and C_ClassTalents and C_ClassTalents.GetActiveConfigID then
    local configID = C_ClassTalents.GetActiveConfigID()
    if configID and C_Traits.GenerateImportLoadout then
      -- 不同版本 API 名可能不同；失败则留空
      local ok, s = pcall(function()
        return C_Traits.GenerateImportLoadout(configID)
      end)
      if ok and type(s) == "string" then loadout = s end
    end
  end
  return { loadout_string = loadout, spec_id = specId }
end

local function collectLockouts()
  local list = {}
  if not GetNumSavedInstances then return list end
  local n = GetNumSavedInstances() or 0
  for i = 1, n do
    local name, _, reset, difficulty, locked, _, _, isRaid, _, difficultyName, numEncounters, encounterProgress =
      GetSavedInstanceInfo(i)
    if locked or (encounterProgress and encounterProgress > 0) then
      local resetAt = nil
      if reset and reset > 0 then
        resetAt = date("!%Y-%m-%dT%H:%M:%SZ", time() + reset)
      end
      list[#list + 1] = {
        instance_id = nil,
        instance_name = name,
        difficulty = difficultyName or tostring(difficulty or ""),
        reset_at = resetAt,
        bosses_killed = encounterProgress or 0,
        bosses_total = numEncounters or 0,
        is_raid = isRaid and true or false,
      }
    end
  end
  return list
end

local function collectProfessions()
  local list = {}
  if not GetProfessions then return list end
  local profs = { GetProfessions() }
  for _, idx in ipairs(profs) do
    if idx then
      local name, _, rank, maxRank = GetProfessionInfo(idx)
      if name then
        list[#list + 1] = {
          name = name,
          skill_current = rank,
          skill_max = maxRank,
          recipes = {}, -- 配方过多，MVP 留空数组；二期再采
        }
      end
    end
  end
  return list
end

local function collectQuestObjectives(questID, questLogIndex)
  local objectives = {}
  if C_QuestLog and C_QuestLog.GetQuestObjectives and questID then
    local ok, objs = pcall(C_QuestLog.GetQuestObjectives, questID)
    if ok and type(objs) == "table" then
      for _, o in ipairs(objs) do
        objectives[#objectives + 1] = {
          text = o.text,
          finished = o.finished and true or false,
          num_fulfilled = o.numFulfilled,
          num_required = o.numRequired,
        }
      end
      return objectives
    end
  end
  if questLogIndex and GetNumQuestLeaderBoards then
    local n = GetNumQuestLeaderBoards(questLogIndex) or 0
    for i = 1, n do
      local text, _, finished = GetQuestLogLeaderBoard(i, questLogIndex)
      if text then
        objectives[#objectives + 1] = {
          text = text,
          finished = finished and true or false,
        }
      end
    end
  end
  return objectives
end

-- 当前任务日志（非世界任务全图；随快照采集）
local function collectQuests()
  local list = {}
  -- 零售 / 无限：C_QuestLog
  if C_QuestLog and C_QuestLog.GetNumQuestLogEntries then
    local num = C_QuestLog.GetNumQuestLogEntries() or 0
    for i = 1, num do
      local info = C_QuestLog.GetInfo and C_QuestLog.GetInfo(i)
      if info and not info.isHeader and info.questID and info.questID > 0 then
        local complete = false
        if C_QuestLog.IsComplete then
          complete = C_QuestLog.IsComplete(info.questID) and true or false
        elseif info.isComplete ~= nil then
          complete = info.isComplete and true or false
        end
        list[#list + 1] = {
          quest_id = info.questID,
          title = info.title or "",
          level = info.level,
          suggested_group = info.suggestedGroup,
          is_complete = complete,
          is_on_map = info.isOnMap and true or false,
          frequency = info.frequency, -- 1日常 2周常 等（视客户端）
          objectives = collectQuestObjectives(info.questID, i),
        }
      end
    end
    return list
  end
  -- 经典 API 回退
  if not GetNumQuestLogEntries then return list end
  local numEntries = GetNumQuestLogEntries() or 0
  for i = 1, numEntries do
    local title, level, _, isHeader, _, isComplete, frequency, questID =
      GetQuestLogTitle(i)
    if not isHeader and title then
      list[#list + 1] = {
        quest_id = questID,
        title = title,
        level = level,
        is_complete = (isComplete and isComplete > 0) and true or false,
        frequency = frequency,
        objectives = collectQuestObjectives(questID, i),
      }
    end
  end
  return list
end

-- announce 可为 bool，或 opts 表：{ announce=, force=, skip_unchanged= }
-- 只保留最新一份，不存本地历史环
function WGA.CaptureSnapshot(announceOrOpts)
  local opts
  if type(announceOrOpts) == "table" then
    opts = announceOrOpts
  else
    opts = { announce = announceOrOpts }
  end
  local announce = opts.announce
  local force = opts.force == true
  local skipUnchanged = opts.skip_unchanged
  if skipUnchanged == nil then
    skipUnchanged = not force
  end

  if not UnitIsConnected or not UnitIsConnected("player") then
    error("player not ready")
  end
  local name, realm = UnitFullName("player")
  realm = realm or GetNormalizedRealmName and GetNormalizedRealmName() or GetRealmName() or ""
  local _, classFile = UnitClass("player")
  local classLocale = UnitClass("player")
  local race = UnitRace("player")
  local level = UnitLevel("player")

  local content = {
    schema_version = 1,
    addon_version = WGA.VERSION,
    client_version = (GetBuildInfo and select(1, GetBuildInfo())) or nil,
    character = {
      name = name,
      realm = realm,
      race = race,
      class = classLocale or classFile,
      spec = getSpecName(),
      level = level,
      item_level = getItemLevel(),
    },
    equipment = collectEquipment(),
    talents = collectTalents(),
    lockouts = collectLockouts(),
    professions = collectProfessions(),
    quests = collectQuests(),
    availability_note = nil,
  }

  -- 不含 captured_at，用于判重（避免无变化仍写盘）
  local contentJson = enc(content)
  WGADB = WGADB or {}
  if skipUnchanged and not force and WGADB.last_content_json == contentJson then
    return nil, "unchanged"
  end

  local snap = content
  snap.captured_at = isoNow()

  WGADB.snapshots = nil -- 不再保留本地历史
  WGADB.last = snap
  WGADB.last_content_json = contentJson
  WGADB.last_json = enc(snap)
  WGADB.updated_at = snap.captured_at

  if announce ~= false then
    local eqCount, tmCount = 0, 0
    for _, e in ipairs(snap.equipment or {}) do
      if e.name or e.item_id then
        eqCount = eqCount + 1
        if e.transmog and (e.transmog.is_transmogrified or e.transmog.is_hidden or e.transmog.illusion_id) then
          tmCount = tmCount + 1
        end
      end
    end
    print(string.format(
      "|cff33ff99WGA|r v%s 已快照 %s-%s（装备 %d / 幻化 %d / CD %d / 专业 %d / 任务 %d）。桌面端可读 SavedVariables。",
      tostring(WGA.VERSION or "?"),
      tostring(name), tostring(realm),
      eqCount, tmCount,
      #(snap.lockouts or {}), #(snap.professions or {}),
      #(snap.quests or {})
    ))
  end
  return snap
end
