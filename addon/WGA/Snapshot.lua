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

local function collectEquipment()
  local list = {}
  for _, pair in ipairs(SLOT_MAP) do
    local slotId, slotName = pair[1], pair[2]
    local link = GetInventoryItemLink("player", slotId)
    if link then
      local itemId = GetInventoryItemID("player", slotId)
      local name = GetItemInfo(link) or link
      local ilvl = nil
      if GetDetailedItemLevelInfo then
        ilvl = GetDetailedItemLevelInfo(link)
      end
      list[#list + 1] = {
        slot = slotName,
        item_id = itemId,
        name = name,
        item_level = ilvl,
        enchant_id = nil,
        gems = {},
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

function WGA.CaptureSnapshot(announce)
  if not UnitIsConnected or not UnitIsConnected("player") then
    error("player not ready")
  end
  local name, realm = UnitFullName("player")
  realm = realm or GetNormalizedRealmName and GetNormalizedRealmName() or GetRealmName() or ""
  local _, classFile = UnitClass("player")
  local classLocale = UnitClass("player")
  local race = UnitRace("player")
  local level = UnitLevel("player")

  local snap = {
    schema_version = 1,
    addon_version = WGA.VERSION,
    client_version = (GetBuildInfo and select(1, GetBuildInfo())) or nil,
    captured_at = isoNow(),
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
    availability_note = nil,
  }

  WGADB = WGADB or {}
  WGADB.snapshots = WGADB.snapshots or {}
  WGADB.snapshots[#WGADB.snapshots + 1] = snap
  -- 只保留最近 20 份，控制 SV 体积
  while #WGADB.snapshots > 20 do
    table.remove(WGADB.snapshots, 1)
  end
  WGADB.last = snap
  WGADB.last_json = enc(snap)
  WGADB.updated_at = snap.captured_at

  if announce ~= false then
    print(string.format(
      "|cff33ff99WGA|r 已快照 %s-%s（装备 %d / CD %d / 专业 %d）。桌面端可读 SavedVariables。",
      tostring(name), tostring(realm),
      #(snap.equipment or {}), #(snap.lockouts or {}), #(snap.professions or {})
    ))
  end
  return snap
end
