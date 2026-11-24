#Requires -Version 5.1
<#
.SYNOPSIS
  探测本机《魔兽世界：无限》(_forever_) 安装与 AddOns 路径。
#>
$ErrorActionPreference = "Continue"

$candidates = @(
    "D:\World of Warcraft\_forever_",
    "C:\World of Warcraft\_forever_",
    "E:\World of Warcraft\_forever_",
    "$env:ProgramFiles\World of Warcraft\_forever_",
    "${env:ProgramFiles(x86)}\World of Warcraft\_forever_"
)

Write-Host "=== 候选 _forever_ 目录 ==="
$found = @()
foreach ($c in $candidates) {
    $exe = Join-Path $c "Wow.exe"
    $addons = Join-Path $c "Interface\AddOns"
    $ok = Test-Path $exe
    Write-Host ("[{0}] {1}" -f ($(if ($ok) { "OK" } else { "--" }), $c))
    if ($ok) {
        $found += [pscustomobject]@{
            WowRoot = $c
            AddOns  = $addons
            AddOnsExists = (Test-Path $addons)
        }
    }
}

if ($found.Count -eq 0) {
    Write-Host "`n未命中常见路径，正在浅层搜索 Wow.exe（可能较慢）..."
    foreach ($drive in @("C:\", "D:\", "E:\")) {
        if (-not (Test-Path $drive)) { continue }
        Get-ChildItem $drive -Filter "Wow.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\_forever_\\' } |
            ForEach-Object {
                $root = $_.Directory.FullName
                $found += [pscustomobject]@{
                    WowRoot = $root
                    AddOns  = (Join-Path $root "Interface\AddOns")
                    AddOnsExists = (Test-Path (Join-Path $root "Interface\AddOns"))
                }
            }
    }
}

Write-Host "`n=== 结果 ==="
if ($found.Count -eq 0) {
    Write-Host "未找到无限服。请手动设置: `$env:WOW_FOREVER_ROOT = '<你的\_forever_路径>'"
    exit 1
}

$found | Format-Table -AutoSize
$primary = $found[0]
Write-Host "建议安装命令:"
Write-Host "  .\scripts\install-addon.ps1 -WowRoot `"$($primary.WowRoot)`""
