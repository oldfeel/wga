#Requires -Version 5.1
<#
.SYNOPSIS
  将仓库中的 WGA 插件复制到《魔兽世界：无限》AddOns 目录。

.EXAMPLE
  .\scripts\install-addon.ps1

.EXAMPLE
  .\scripts\install-addon.ps1 -WowRoot "D:\World of Warcraft\_forever_"

.EXAMPLE
  $env:WOW_FOREVER_ROOT = "D:\World of Warcraft\_forever_"
  .\scripts\install-addon.ps1
#>
param(
    [string]$WowRoot = $env:WOW_FOREVER_ROOT,
    [string]$AddonName = "WGA",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $RepoRoot "addon\$AddonName"

# 本机默认：已探测到的无限服目录
if (-not $WowRoot) {
    $WowRoot = "D:\World of Warcraft\_forever_"
}

$DestAddOns = Join-Path $WowRoot "Interface\AddOns"
$Dest = Join-Path $DestAddOns $AddonName

if (-not (Test-Path $Source)) {
    Write-Error "源插件目录不存在: $Source`n请先在 addon\$AddonName\ 下放入 .toc / .lua 后再运行。"
}

if (-not (Test-Path (Join-Path $WowRoot "Wow.exe")) -and -not (Test-Path (Join-Path $WowRoot "WowClassic.exe"))) {
    Write-Warning "未在 $WowRoot 找到 Wow.exe，仍将尝试复制。可用 -WowRoot 指定正确目录。"
}

if (-not (Test-Path $DestAddOns)) {
    if ($WhatIf) {
        Write-Host "[WhatIf] 将创建: $DestAddOns"
    } else {
        New-Item -ItemType Directory -Force -Path $DestAddOns | Out-Null
        Write-Host "已创建 AddOns 目录: $DestAddOns"
    }
}

Write-Host "源: $Source"
Write-Host "目标: $Dest"

if ($WhatIf) {
    Write-Host "[WhatIf] 将同步复制 addon -> AddOns（覆盖同名文件）"
    exit 0
}

if (Test-Path $Dest) {
    Remove-Item -Recurse -Force $Dest
}

Copy-Item -Path $Source -Destination $Dest -Recurse -Force
Write-Host "完成。请在游戏内确认插件列表已启用 $AddonName，必要时 /reload。"
Write-Host "SavedVariables 预计路径: $(Join-Path $WowRoot 'WTF\Account\<账号>\SavedVariables')\$AddonName.lua"
