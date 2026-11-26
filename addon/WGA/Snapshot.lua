--[[ 采集角色快照 → WGADB（SavedVariables）+ last_json 字符串 ]]
-- 栏位：优先 GetInventorySlotInfo；圣物/远程 = RANGEDSLOT
local function invSlot(slotName, fallback)
  if type(GetInventorySlotInfo) == "function" then
    local ok, id = pcall(GetInventorySlotInfo, slotName)
    if ok and type(id) == "number" and id > 0 then
      return id
    end
  end
  return fallback
end

local function getSlotMap()
  return {
  {invSlot("HEADSLOT", 1), "HEAD"},
  {invSlot("NECKSLOT", 2), "NECK"},
  {invSlot("SHOULDERSLOT", 3), "SHOULDER"},
  {invSlot("CHESTSLOT", 5), "CHEST"},
  {invSlot("SHIRTSLOT", 4), "SHIRT"},
  {invSlot("TABARDSLOT", 19), "TABARD"},
  {invSlot("WAISTSLOT", 6), "WAIST"},
  {invSlot("LEGSSLOT", 7), "LEGS"},
  {invSlot("FEETSLOT", 8), "FEET"},
  {invSlot("WRISTSLOT", 9), "WRIST"},
  {invSlot("HANDSSLOT", 10), "HANDS"},
  {invSlot("FINGER0SLOT", 11), "FINGER1"},
  {invSlot("FINGER1SLOT", 12), "FINGER2"},
  {invSlot("TRINKET0SLOT", 13), "TRINKET1"},
  {invSlot("TRINKET1SLOT", 14), "TRINKET2"},
  {invSlot("BACKSLOT", 15), "BACK"},
  {invSlot("MAINHANDSLOT", 16), "MAINHAND"},
  {invSlot("SECONDARYHANDSLOT", 17), "OFFHAND"},
  -- 圣物（神像/圣契/图腾）与远程武器同栏
  {invSlot("RANGEDSLOT", 18), "RELIC"},
  }
end

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

local function rgb255(c)
  if not c then return nil end
  local r = c.r or c.R or 1
  local g = c.g or c.G or 1
  local b = c.b or c.B or 1
  return {
    r = math.floor(r * 255 + 0.5),
    g = math.floor(g * 255 + 0.5),
    b = math.floor(b * 255 + 0.5),
  }
end

local function pushTipLine(lines, left, right, color)
  left = left and tostring(left) or ""
  right = right and tostring(right) or ""
  if left == "" and right == "" then return end
  -- 跳过纯空白行占位，保留分隔感用空 left
  local row = { left = left, right = right }
  if color then row.color = color end
  lines[#lines + 1] = row
end

-- 完整物品 tip：属性 / 装备特效 / 描述文字
local function collectTooltipLines(slotId, link)
  local lines = {}
  local function takeFromData(data)
    if not data or not data.lines then return 0 end
    local n = 0
    for _, line in ipairs(data.lines) do
      local left = line.leftText and tostring(line.leftText) or ""
      local right = line.rightText and tostring(line.rightText) or ""
      if left ~= "" or right ~= "" then
        local row = { left = left, right = right }
        local c = rgb255(line.leftColor)
        if c then row.color = c end
        lines[#lines + 1] = row
        n = n + 1
      end
    end
    return n
  end

  -- 1) 结构化 tip
  if C_TooltipInfo then
    if slotId and C_TooltipInfo.GetInventoryItem then
      local ok, d = pcall(C_TooltipInfo.GetInventoryItem, "player", slotId, false)
      if ok and takeFromData(d) > 0 then return lines end
    end
    if link and C_TooltipInfo.GetHyperlink then
      lines = {}
      local ok, d = pcall(C_TooltipInfo.GetHyperlink, link, nil, nil, true)
      if ok and takeFromData(d) > 0 then return lines end
    end
    if link and C_TooltipInfo.GetItemByID then
      local itemId = GetInventoryItemID and slotId and GetInventoryItemID("player", slotId)
      if itemId then
        lines = {}
        local ok, d = pcall(C_TooltipInfo.GetItemByID, itemId)
        if ok and takeFromData(d) > 0 then return lines end
      end
    end
  end

  -- 2) GameTooltip 扫描（无限上很稳）
  lines = {}
  local tip = _G.WGATooltipScanner
  if not tip and CreateFrame then
    local ok, frame = pcall(CreateFrame, "GameTooltip", "WGATooltipScanner", UIParent, "GameTooltipTemplate")
    if ok then
      tip = frame
      tip:SetOwner(UIParent, "ANCHOR_NONE")
      _G.WGATooltipScanner = tip
    end
  end
  if tip then
    tip:ClearLines()
    local setOk = false
    if slotId then
      setOk = pcall(function() tip:SetInventoryItem("player", slotId) end)
    end
    if (not setOk) and link then
      setOk = pcall(function() tip:SetHyperlink(link) end)
    end
    if setOk then
      local n = tip:NumLines() or 0
      for i = 1, n do
        local leftFs = _G["WGATooltipScannerTextLeft" .. i]
        local rightFs = _G["WGATooltipScannerTextRight" .. i]
        local left = leftFs and leftFs:GetText() or ""
        local right = rightFs and rightFs:GetText() or ""
        local color = nil
        if leftFs and leftFs.GetTextColor then
          local r, g, b = leftFs:GetTextColor()
          color = rgb255({ r = r, g = g, b = b })
        end
        if left ~= "" or right ~= "" then
          local row = { left = left or "", right = right or "" }
          if color then row.color = color end
          lines[#lines + 1] = row
        end
      end
    end
  end
  return lines
end

local function itemDesc(link, itemSubType, equipLoc)
  local parts = {}
  if itemSubType and itemSubType ~= "" then parts[#parts + 1] = itemSubType end
  if equipLoc and _G and _G[equipLoc] then
    parts[#parts + 1] = _G[equipLoc]
  elseif equipLoc and equipLoc ~= "" then
    parts[#parts + 1] = equipLoc
  end
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
  for _, pair in ipairs(getSlotMap()) do
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
      local tipLines = {}
      local tipOk, tipRes = pcall(collectTooltipLines, slotId, link)
      if tipOk and type(tipRes) == "table" then tipLines = tipRes end
      list[#list + 1] = {
        slot = slotName,
        item_id = itemId,
        name = name,
        item_level = ilvl,
        quality = quality,
        icon = icon,
        icon_file_id = iconFileId,
        desc = itemDesc(link, itemSubType, equipLoc),
        tooltip_lines = tipLines,
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

local function invSlotIdToName()
  local m = {}
  for _, pair in ipairs(getSlotMap()) do
    m[pair[1]] = pair[2]
  end
  return m
end

local function itemBriefById(itemId)
  if not itemId or itemId <= 0 then return nil end
  if C_Item and C_Item.RequestLoadItemDataByID then
    pcall(C_Item.RequestLoadItemDataByID, itemId)
  end
  local name, quality, iconFileId
  if C_Item and C_Item.GetItemNameByID then
    local ok, n = pcall(C_Item.GetItemNameByID, itemId)
    if ok then name = n end
  end
  if C_Item and C_Item.GetItemQualityByID then
    local ok, q = pcall(C_Item.GetItemQualityByID, itemId)
    if ok then quality = q end
  end
  if C_Item and C_Item.GetItemIconByID then
    local ok, ic = pcall(C_Item.GetItemIconByID, itemId)
    if ok and type(ic) == "number" then iconFileId = ic end
  end
  if (not name or name == "") and itemInfo then
    local n, _, q = itemInfo(itemId)
    name = name or n
    quality = quality or q
  end
  -- 方案里的装也尽量采 tip（未穿上时靠 itemID）
  local tipLines = {}
  local link
  if type(itemId) == "number" then
    link = ("item:%d"):format(itemId)
  end
  local tipOk, tipRes = pcall(collectTooltipLines, nil, link)
  if tipOk and type(tipRes) == "table" then tipLines = tipRes end
  return {
    item_id = itemId,
    name = name,
    quality = quality,
    icon_file_id = iconFileId,
    tooltip_lines = tipLines,
  }
end

-- 装备配置方案（C_EquipmentSet；无限角色面板装备管理）
local function collectEquipmentSets()
  local list = {}
  if not C_EquipmentSet then return list end
  local ids
  if C_EquipmentSet.GetEquipmentSetIDs then
    local ok, v = pcall(C_EquipmentSet.GetEquipmentSetIDs)
    if ok then ids = v end
  end
  if type(ids) ~= "table" then return list end
  local slotMap = invSlotIdToName()
  for _, setId in ipairs(ids) do
    local name, iconFileID, isEquipped
    if C_EquipmentSet.GetEquipmentSetInfo then
      local ok, n, icon, _id, equipped = pcall(C_EquipmentSet.GetEquipmentSetInfo, setId)
      if ok then
        name, iconFileID, isEquipped = n, icon, equipped
      end
    end
    local items = {}
    local itemIDs
    if C_EquipmentSet.GetItemIDs then
      local ok, v = pcall(C_EquipmentSet.GetItemIDs, setId)
      if ok then itemIDs = v end
    end
    if type(itemIDs) == "table" then
      for invSlot, itemId in pairs(itemIDs) do
        local slotName = slotMap[invSlot]
        if slotName and type(itemId) == "number" and itemId > 0 then
          local brief = itemBriefById(itemId) or { item_id = itemId }
          brief.slot = slotName
          items[#items + 1] = brief
        end
      end
    end
    list[#list + 1] = {
      id = setId,
      name = name or ("方案 " .. tostring(setId)),
      icon_file_id = iconFileID,
      is_equipped = isEquipped and true or false,
      items = items,
    }
  end
  return list
end

local function tipLinesFromTooltipData(data)
  local lines = {}
  if not data or not data.lines then return lines end
  for _, line in ipairs(data.lines) do
    local left = line.leftText and tostring(line.leftText) or ""
    local right = line.rightText and tostring(line.rightText) or ""
    if left ~= "" or right ~= "" then
      local row = { left = left, right = right }
      local c = rgb255(line.leftColor)
      if c then row.color = c end
      lines[#lines + 1] = row
    end
  end
  return lines
end

-- 被动天赋的 Spell tip 经常只剩「被动」二字，不算完整
local function tipLooksIncomplete(lines, talentName)
  if not lines or #lines == 0 then return true end
  local meaningful = 0
  for _, ln in ipairs(lines) do
    local t = (ln.left or ""):gsub("%s+", "")
    if t ~= "" and t ~= "被动" and t ~= "Passive"
      and t ~= (talentName or "")
      and not t:find("^等级")
      and not t:find("^Rank") then
      meaningful = meaningful + 1
    end
  end
  return meaningful == 0
end

local function appendDescLine(lines, desc)
  if type(desc) ~= "string" or desc == "" then return end
  local trimmed = desc:gsub("^%s+", ""):gsub("%s+$", "")
  if trimmed == "" or trimmed == "被动" or trimmed == "Passive" then return end
  for _, ln in ipairs(lines) do
    if (ln.left or "") == trimmed then return end
  end
  lines[#lines + 1] = { left = trimmed }
end

local function resolveTalentDescription(entryID, rank, def, spellID)
  local desc
  local r = tonumber(rank) or 1
  if r < 1 then r = 1 end

  if entryID and C_Traits and C_Traits.GetTraitDescription then
    local ok, d = pcall(C_Traits.GetTraitDescription, entryID, r)
    if ok and type(d) == "string" and d ~= "" then desc = d end
  end
  if (not desc or desc == "") and def and type(def.overrideDescription) == "string" and def.overrideDescription ~= "" then
    desc = def.overrideDescription
  end
  if (not desc or desc == "") and spellID then
    if C_Spell and C_Spell.RequestLoadSpellData then
      pcall(C_Spell.RequestLoadSpellData, spellID)
    end
    if C_Spell and C_Spell.GetSpellDescription then
      local ok, d = pcall(C_Spell.GetSpellDescription, spellID)
      if ok and type(d) == "string" and d ~= "" then desc = d end
    end
    if (not desc or desc == "") and GetSpellDescription then
      local ok, d = pcall(GetSpellDescription, spellID)
      if ok and type(d) == "string" and d ~= "" then desc = d end
    end
  end
  if desc == "被动" or desc == "Passive" then desc = nil end
  return desc
end

local function collectTalentTooltipLines(entryID, rank, spellID, talentName, def)
  local lines = {}
  local r = tonumber(rank) or 1
  if r < 1 then r = 1 end

  -- 1) 天赋条目 tip（含完整被动说明）
  if entryID and C_TooltipInfo and C_TooltipInfo.GetTraitEntry then
    local ok, d = pcall(C_TooltipInfo.GetTraitEntry, entryID, r)
    if ok then lines = tipLinesFromTooltipData(d) end
  end

  -- 2) 法术 tip（主动技能更完整；被动常只有「被动」）
  if tipLooksIncomplete(lines, talentName) and spellID and C_TooltipInfo then
    if C_TooltipInfo.GetSpellByID then
      local ok, d = pcall(C_TooltipInfo.GetSpellByID, spellID)
      if ok then
        local spellLines = tipLinesFromTooltipData(d)
        if not tipLooksIncomplete(spellLines, talentName) then
          lines = spellLines
        elseif #lines == 0 then
          lines = spellLines
        end
      end
    end
  end

  -- 3) GameTooltip 扫描
  if tipLooksIncomplete(lines, talentName) then
    local tip = _G.WGATooltipScanner
    if not tip and CreateFrame then
      local ok, frame = pcall(CreateFrame, "GameTooltip", "WGATooltipScanner", UIParent, "GameTooltipTemplate")
      if ok then
        tip = frame
        tip:SetOwner(UIParent, "ANCHOR_NONE")
        _G.WGATooltipScanner = tip
      end
    end
    if tip then
      tip:ClearLines()
      local setOk = false
      if spellID and tip.SetSpellByID then
        setOk = pcall(function() tip:SetSpellByID(spellID) end)
      end
      if setOk then
        local scanned = {}
        local n = tip:NumLines() or 0
        for i = 1, n do
          local leftFs = _G["WGATooltipScannerTextLeft" .. i]
          local rightFs = _G["WGATooltipScannerTextRight" .. i]
          local left = leftFs and leftFs:GetText() or ""
          local right = rightFs and rightFs:GetText() or ""
          local color = nil
          if leftFs and leftFs.GetTextColor then
            local rr, gg, bb = leftFs:GetTextColor()
            color = rgb255({ r = rr, g = gg, b = bb })
          end
          if left ~= "" or right ~= "" then
            local row = { left = left or "", right = right or "" }
            if color then row.color = color end
            scanned[#scanned + 1] = row
          end
        end
        if not tipLooksIncomplete(scanned, talentName) then
          lines = scanned
        elseif #lines == 0 then
          lines = scanned
        end
      end
    end
  end

  -- 4) 描述文本补全（解决只显示「被动」）
  local desc = resolveTalentDescription(entryID, r, def, spellID)
  if tipLooksIncomplete(lines, talentName) then
    if talentName and talentName ~= "" then
      lines = { { left = talentName, color = { r = 255, g = 210, b = 0 } } }
    else
      lines = {}
    end
    if desc then
      appendDescLine(lines, desc)
    end
  else
    appendDescLine(lines, desc)
  end

  return lines, desc
end

local function talentEntryMeta(configID, entryID, rank)
  local name, spellID, iconFileId, tipLines, description
  tipLines = {}
  if not (entryID and C_Traits and C_Traits.GetEntryInfo) then
    return name, spellID, iconFileId, tipLines, description
  end
  local ok, entry = pcall(C_Traits.GetEntryInfo, configID, entryID)
  if not (ok and entry and entry.definitionID and C_Traits.GetDefinitionInfo) then
    return name, spellID, iconFileId, tipLines, description
  end
  local ok2, def = pcall(C_Traits.GetDefinitionInfo, entry.definitionID)
  if not (ok2 and def) then return name, spellID, iconFileId, tipLines, description end
  name = def.overrideName
  spellID = def.spellID
  if (not name or name == "") and spellID and C_Spell and C_Spell.GetSpellName then
    local ok3, sn = pcall(C_Spell.GetSpellName, spellID)
    if ok3 then name = sn end
  end
  if (not iconFileId) and def.overrideIcon then
    iconFileId = def.overrideIcon
  end
  if spellID and C_Spell and C_Spell.GetSpellTexture then
    local ok4, tex = pcall(C_Spell.GetSpellTexture, spellID)
    if ok4 and type(tex) == "number" then
      iconFileId = tex
    end
  end
  local okTip, tipRes, descRes = pcall(collectTalentTooltipLines, entryID, rank, spellID, name, def)
  if okTip and type(tipRes) == "table" then
    tipLines = tipRes
    description = descRes
  end
  return name, spellID, iconFileId, tipLines, description
end

-- Forever：一棵 Camelot 树里通常有 3 个天赋页（Arms/Fury/…），用 group 区分
-- configID：主/副天赋各有独立 CamelotCombat config（见 GetCombatConfigIDForSpecGroup）
local function collectTalentDetailsForConfig(configID)
  local out = { config_id = configID, config_name = nil, tree_id = nil, tabs = {}, trees = {}, nodes = {} }
  if not (configID and C_Traits) then
    return out
  end
  local ok, configInfo = pcall(C_Traits.GetConfigInfo, configID)
  if not (ok and type(configInfo) == "table") then return out end
  out.config_name = configInfo.name

  local tabByGroup = {}
  local tabList = {}
  for _, treeID in ipairs(configInfo.treeIDs or {}) do
    out.tree_id = out.tree_id or treeID
    local spentTotal = 0
    if C_Traits.GetTreeCurrencyInfo then
      local ok2, currencies = pcall(C_Traits.GetTreeCurrencyInfo, configID, treeID, false)
      if ok2 and type(currencies) == "table" then
        for _, c in ipairs(currencies) do
          spentTotal = spentTotal + (tonumber(c.spent) or 0)
        end
      end
    end
    out.trees[#out.trees + 1] = { tree_id = treeID, points_spent = spentTotal }

    if C_Traits.GetGroupDisplayInfoByTreeID then
      local okg, groups = pcall(C_Traits.GetGroupDisplayInfoByTreeID, treeID)
      if okg and type(groups) == "table" then
        for _, g in ipairs(groups) do
          local gid = g.groupID or g.ID or g.traitNodeGroupID
          if gid then
            local tab = {
              group_id = gid,
              name = g.displayName or g.name or ("页 " .. tostring(gid)),
              icon_file_id = g.icon,
              order_index = tonumber(g.orderIndex) or (#tabList + 1),
              points_spent = 0,
              nodes = {},
            }
            tabByGroup[gid] = tab
            tabList[#tabList + 1] = tab
          end
        end
      end
    end

    -- 各页已投入点数
    if C_Traits.GetGroupCurrencyInfo and #tabList > 0 then
      local gids = {}
      for _, t in ipairs(tabList) do gids[#gids + 1] = t.group_id end
      local okc, infos = pcall(C_Traits.GetGroupCurrencyInfo, configID, gids)
      if okc and type(infos) == "table" then
        for _, info in ipairs(infos) do
          local gid = info.traitNodeGroupID or info.groupID
          local tab = gid and tabByGroup[gid]
          if tab and type(info.currencyInfos) == "table" then
            local spent = 0
            for _, c in ipairs(info.currencyInfos) do
              spent = spent + (tonumber(c.spent) or 0)
            end
            tab.points_spent = spent
          end
        end
      end
    end

    if C_Traits.GetTreeNodes then
      local ok3, nodeIDs = pcall(C_Traits.GetTreeNodes, treeID)
      if ok3 and type(nodeIDs) == "table" then
        for _, nodeID in ipairs(nodeIDs) do
          local ok4, nodeInfo = pcall(C_Traits.GetNodeInfo, configID, nodeID)
          if ok4 and type(nodeInfo) == "table" and (tonumber(nodeInfo.ID) or 0) > 0 then
            local rank = tonumber(nodeInfo.currentRank) or 0
            local maxRank = tonumber(nodeInfo.maxRanks) or 0
            local entryID = nodeInfo.activeEntry and nodeInfo.activeEntry.entryID
            if (not entryID) and type(nodeInfo.entryIDs) == "table" then
              entryID = nodeInfo.entryIDs[1]
            end
            -- 取描述用至少 1 级，避免未学节点 rank=0 时 GetTraitDescription 空
            local tipRank = rank > 0 and rank or math.max(maxRank, 1)
            local entryName, spellID, iconFileId, tipLines, description =
              talentEntryMeta(configID, entryID, tipRank)
            -- 归属哪个天赋页：groupIDs 里匹配展示组（页 id 可能不在第一位）
            local tabGroupId
            if type(nodeInfo.groupIDs) == "table" then
              for _, gid in ipairs(nodeInfo.groupIDs) do
                if tabByGroup[gid] then
                  tabGroupId = gid
                  break
                end
              end
            end
            local node = {
              node_id = nodeID,
              tree_id = treeID,
              group_id = tabGroupId,
              pos_x = tonumber(nodeInfo.posX) or 0,
              pos_y = tonumber(nodeInfo.posY) or 0,
              rank = rank,
              max_rank = maxRank,
              name = entryName,
              spell_id = spellID,
              icon_file_id = iconFileId,
              tooltip_lines = tipLines or {},
              description = description,
            }
            out.nodes[#out.nodes + 1] = node
            if tabGroupId and tabByGroup[tabGroupId] then
              local tnodes = tabByGroup[tabGroupId].nodes
              tnodes[#tnodes + 1] = node
            end
          end
        end
      end
    end
  end

  table.sort(tabList, function(a, b)
    return (a.order_index or 0) < (b.order_index or 0)
  end)
  out.tabs = tabList
  return out
end

local function resolveConfigIDForSpecGroup(groupIndex, isActive)
  -- Forever 双天赋：每套 SpecGroup 对应独立 combat config
  if C_SpecializationInfo and C_SpecializationInfo.GetCombatConfigIDForSpecGroup then
    local ok, cid = pcall(C_SpecializationInfo.GetCombatConfigIDForSpecGroup, groupIndex)
    if ok and type(cid) == "number" and cid > 0 then
      return cid
    end
  end
  if isActive and C_ClassTalents and C_ClassTalents.GetActiveConfigID then
    local ok, cid = pcall(C_ClassTalents.GetActiveConfigID)
    if ok and type(cid) == "number" and cid > 0 then
      return cid
    end
  end
  return nil
end

local function talentGroupHasTree(g)
  if not g then return false end
  if type(g.tabs) == "table" and #g.tabs > 0 then return true end
  if type(g.nodes) == "table" and #g.nodes > 0 then return true end
  return false
end

local function collectTalentGroups()
  local groups = {}
  local num = 1
  if C_SpecializationInfo and C_SpecializationInfo.GetNumSpecGroups then
    local ok, n = pcall(C_SpecializationInfo.GetNumSpecGroups)
    if ok and type(n) == "number" and n > 0 then num = n end
  elseif type(GetNumSpecGroups) == "function" then
    local ok, n = pcall(GetNumSpecGroups)
    if ok and type(n) == "number" and n > 0 then num = n end
  end
  -- 双天赋最多两套；装备配置方案不在此限制
  if num > 2 then num = 2 end

  local active = 1
  if C_SpecializationInfo and C_SpecializationInfo.GetActiveSpecGroup then
    local ok, a = pcall(C_SpecializationInfo.GetActiveSpecGroup)
    if ok and type(a) == "number" and a > 0 then active = a end
  elseif type(GetActiveSpecGroup) == "function" then
    local ok, a = pcall(GetActiveSpecGroup)
    if ok and type(a) == "number" and a > 0 then active = a end
  end

  WGADB = WGADB or {}
  WGADB.talent_group_cache = WGADB.talent_group_cache or {}

  for i = 1, num do
    local label = (i == 1) and "主天赋" or "副天赋"
    if C_SpecializationInfo and C_SpecializationInfo.GetSpecialization then
      local ok, specIdx = pcall(C_SpecializationInfo.GetSpecialization, false, false, i)
      if ok and specIdx and C_SpecializationInfo.GetSpecializationInfo then
        local ok2, _id, sn = pcall(C_SpecializationInfo.GetSpecializationInfo, specIdx, false, false, i)
        if ok2 and type(sn) == "string" and sn ~= "" then
          label = sn
        end
      end
    end
    local isActive = (i == active)
    local g = {
      index = i,
      name = label,
      active = isActive,
      trees = {},
      tabs = {},
      nodes = {},
    }

    local configID = resolveConfigIDForSpecGroup(i, isActive)
    if configID then
      local details = collectTalentDetailsForConfig(configID)
      g.config_id = configID
      g.config_name = details.config_name
      g.tree_id = details.tree_id
      g.trees = details.trees or {}
      g.tabs = details.tabs or {}
      g.nodes = details.nodes or {}
    end

    -- 读不到非当前套时，用上次成功采集的缓存，避免切换后另一套变空
    if not talentGroupHasTree(g) then
      local cached = WGADB.talent_group_cache[i]
      if type(cached) == "table" and talentGroupHasTree(cached) then
        g.config_id = cached.config_id or g.config_id
        g.config_name = cached.config_name or g.config_name
        g.tree_id = cached.tree_id or g.tree_id
        g.trees = cached.trees or {}
        g.tabs = cached.tabs or {}
        g.nodes = cached.nodes or {}
        g.from_cache = true
      end
    end

    if talentGroupHasTree(g) then
      WGADB.talent_group_cache[i] = {
        config_id = g.config_id,
        config_name = g.config_name,
        tree_id = g.tree_id,
        trees = g.trees,
        tabs = g.tabs,
        nodes = g.nodes,
        name = g.name,
      }
    end

    groups[#groups + 1] = g
  end
  return groups
end

local function collectTalents()
  local loadout = ""
  local specId = nil
  if GetSpecialization then
    local idx = GetSpecialization()
    if idx and GetSpecializationInfo then
      specId = select(1, GetSpecializationInfo(idx))
    end
  elseif C_SpecializationInfo and C_SpecializationInfo.GetSpecialization then
    local ok, idx = pcall(C_SpecializationInfo.GetSpecialization)
    if ok and idx and C_SpecializationInfo.GetSpecializationInfo then
      local ok2, sid = pcall(C_SpecializationInfo.GetSpecializationInfo, idx)
      if ok2 then specId = sid end
    end
  end
  if C_Traits and C_ClassTalents and C_ClassTalents.GetActiveConfigID then
    local configID = C_ClassTalents.GetActiveConfigID()
    if configID and C_Traits.GenerateImportLoadout then
      local ok, s = pcall(function()
        return C_Traits.GenerateImportLoadout(configID)
      end)
      if ok and type(s) == "string" then loadout = s end
    end
  end
  return {
    loadout_string = loadout,
    spec_id = specId,
    groups = collectTalentGroups(),
  }
end

-- 公会 + 服务器层级（无限服二级 = 官方规则集码；读不出则 UNKNOWN，由桌面/Web 自选）
-- 规则集码：NORMAL / PVP / RP / RP_PVP / HARDCORE / UNKNOWN
local function detectFlavor()
  -- 本插件面向无限服；有官方工程 ID 时再细分
  if type(WOW_PROJECT_ID) == "number" then
    if WOW_PROJECT_MAINLINE and WOW_PROJECT_ID == WOW_PROJECT_MAINLINE then
      return "retail"
    end
    if WOW_PROJECT_CLASSIC and WOW_PROJECT_ID == WOW_PROJECT_CLASSIC then
      return "classic"
    end
    if WOW_PROJECT_BURNING_CRUSADE_CLASSIC and WOW_PROJECT_ID == WOW_PROJECT_BURNING_CRUSADE_CLASSIC then
      return "classic"
    end
    if WOW_PROJECT_WRATH_CLASSIC and WOW_PROJECT_ID == WOW_PROJECT_WRATH_CLASSIC then
      return "classic"
    end
    if WOW_PROJECT_CATACLYSM_CLASSIC and WOW_PROJECT_ID == WOW_PROJECT_CATACLYSM_CLASSIC then
      return "classic"
    end
  end
  return "forever"
end

local function classifyRulesetBlob(blob)
  local text = tostring(blob or "")
  local upper = string.upper(text)
  -- 先匹配更具体的组合，避免 RP-PvP 被拆成 RP 或 PVP
  if string.find(upper, "RP_PVP", 1, true) or string.find(upper, "RP-PVP", 1, true)
      or string.find(upper, "RPPVP", 1, true) or string.find(upper, "RP PVP", 1, true)
      or string.find(text, "角色扮演PvP", 1, true) or string.find(text, "角色扮演 PvP", 1, true)
      or string.find(text, "角色扮演PVP", 1, true) then
    return "RP_PVP"
  end
  if string.find(upper, "HARDCORE", 1, true) or string.find(text, "专家模式", 1, true) then
    return "HARDCORE"
  end
  if string.find(upper, "PVP", 1, true) then
    return "PVP"
  end
  if string.find(upper, "RP", 1, true) or string.find(text, "角色扮演", 1, true) then
    return "RP"
  end
  if string.find(upper, "PVE", 1, true) or string.find(upper, "NORMAL", 1, true)
      or string.find(text, "普通", 1, true) then
    return "NORMAL"
  end
  return nil
end

local function detectRegionKey(flavor)
  -- 无限服：尝试从 realm / GetRealmInfo 推断官方规则集；多数中文服名读不出 → UNKNOWN
  local realm = (GetRealmName and GetRealmName()) or ""
  local hit = classifyRulesetBlob(realm)
  if hit then return hit end
  if type(GetRealmInfo) == "function" then
    local ok, a, b, c = pcall(GetRealmInfo)
    if ok then
      hit = classifyRulesetBlob(table.concat({ tostring(a or ""), tostring(b or ""), tostring(c or "") }, " "))
      if hit then return hit end
    end
  end
  if flavor == "forever" then
    return "UNKNOWN"
  end
  return "UNKNOWN"
end

local function collectGuild(realmName)
  -- 未入会直接跳过（部分客户端无 IsInGuild 则继续尝试）
  if type(IsInGuild) == "function" then
    local okIn, inGuild = pcall(IsInGuild)
    if okIn and inGuild == false then
      return nil
    end
  end
  -- 触发名册刷新；多数客户端本地已有缓存，GetGuildInfo 仍可读
  if type(GuildRoster) == "function" then
    pcall(GuildRoster)
  elseif C_GuildInfo and type(C_GuildInfo.GuildRoster) == "function" then
    pcall(C_GuildInfo.GuildRoster)
  end

  -- Forever: GetGuildInfo("player") → name, rankName, rankIndex, realm（C_GuildInfo 无自己公会名）
  local gname, grank, grankIndex, guildRealm
  if type(GetGuildInfo) == "function" then
    local ok, a, b, c, d = pcall(GetGuildInfo, "player")
    if ok and type(a) == "string" and a ~= "" then
      gname, grank, grankIndex, guildRealm = a, b, c, d
    end
    if (not gname or gname == "") then
      ok, a, b, c, d = pcall(GetGuildInfo)
      if ok and type(a) == "string" and a ~= "" then
        gname, grank, grankIndex, guildRealm = a, b, c, d
      end
    end
  end
  -- 兜底：与 Shift 看人一样，扫自己单位 tip 上的 <公会名>
  if (not gname or gname == "") then
    local tipName = "WGAGuildTipScan"
    local tip = _G[tipName]
    if not tip then
      local ok, frame = pcall(CreateFrame, "GameTooltip", tipName, UIParent, "GameTooltipTemplate")
      if ok then tip = frame end
    end
    if tip then
      tip:SetOwner(UIParent, "ANCHOR_NONE")
      tip:ClearLines()
      local setOk = pcall(function() tip:SetUnit("player") end)
      if setOk then
        local n = tip:NumLines() or 0
        for i = 1, n do
          local fs = _G[tipName .. "TextLeft" .. i]
          local text = fs and fs:GetText()
          if type(text) == "string" then
            -- 常见格式：<公会名> 或 <公会名>（会阶）
            local m = text:match("^%s*<([^>]+)>")
            if m and m ~= "" then
              gname = m
              break
            end
          end
        end
      end
      tip:Hide()
    end
  end
  if (not gname or gname == "") and type(GetGuildName) == "function" then
    local ok, a = pcall(GetGuildName)
    if ok and type(a) == "string" and a ~= "" then
      gname = a
    end
  end
  if not gname or gname == "" then
    return nil
  end

  local isLeader = false
  if type(IsGuildLeader) == "function" then
    local ok, v = pcall(IsGuildLeader)
    if ok and v then isLeader = true end
  elseif type(IsGuildMaster) == "function" then
    local ok, v = pcall(IsGuildMaster)
    if ok and v then isLeader = true end
  end
  -- rankIndex 0 通常是会长
  if (not isLeader) and type(grankIndex) == "number" and grankIndex == 0 then
    isLeader = true
  end

  local flavor = detectFlavor()
  local realm = ""
  if type(guildRealm) == "string" and guildRealm ~= "" then
    realm = guildRealm
  else
    realm = realmName or ((GetNormalizedRealmName and GetNormalizedRealmName()) or (GetRealmName and GetRealmName()) or "")
  end
  return {
    name = gname,
    rank = grank,
    rank_index = grankIndex,
    is_leader = isLeader and true or false,
    flavor = flavor,
    region_key = detectRegionKey(flavor),
    realm_name = realm,
  }
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
    guild = collectGuild(realm),
    equipment = collectEquipment(),
    equipment_sets = collectEquipmentSets(),
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
    local g = snap.guild
    local gPart = (g and g.name) and (" / 公会 " .. tostring(g.name) .. (g.is_leader and "·会长" or "")) or " / 无公会"
    local flushHint = opts.will_reload
      and "即将刷新界面写入磁盘。"
      or "数据仍在内存；桌面端要读到需 /reload（或 /wga flush on 后手动快照）。"
    print(string.format(
      "|cff33ff99WGA|r v%s 已快照 %s-%s%s（装备 %d / 幻化 %d / CD %d / 专业 %d / 任务 %d）。%s",
      tostring(WGA.VERSION or "?"),
      tostring(name), tostring(realm), gPart,
      eqCount, tmCount,
      #(snap.lockouts or {}), #(snap.professions or {}),
      #(snap.quests or {}),
      flushHint
    ))
  end
  return snap
end
