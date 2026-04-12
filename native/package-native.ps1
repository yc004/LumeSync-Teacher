param(
  [string]$Configuration = "Release",
  [string]$BuildDir = "build/native-vs",
  [string]$OutDir = "dist/teacher-native"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildRoot = Join-Path $RepoRoot $BuildDir
$OutputRoot = Join-Path $RepoRoot $OutDir
$ShellExe = Join-Path $BuildRoot "native/shell/$Configuration/LumeSyncTeacherShell.exe"
$ServerDir = Join-Path $RepoRoot "server"
$SharedPublicDir = Join-Path $RepoRoot "shared/public"
$SharedTeacherShellDir = Join-Path $RepoRoot "shared/teacher-shell"
$SharedBuildDir = Join-Path $RepoRoot "shared/build"
$SharedAssetsDir = Join-Path $RepoRoot "shared/assets"
$CoreDir = if ($env:LUMESYNC_CORE_DIR) { Resolve-Path $env:LUMESYNC_CORE_DIR } else { Resolve-Path (Join-Path $RepoRoot "../core") }
$CorePackagesDir = Join-Path $CoreDir "packages"
$NodeModulesDir = Join-Path $RepoRoot "node_modules"

if (-not (Test-Path $ShellExe)) {
  throw "Missing shell binary: $ShellExe"
}

if (Test-Path $OutputRoot) {
  Remove-Item -Recurse -Force $OutputRoot
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
Copy-Item -Force $ShellExe (Join-Path $OutputRoot "LumeSyncTeacherShell.exe")

foreach ($entry in @(
  @{ From = $ServerDir; To = "server" },
  @{ From = $SharedPublicDir; To = "shared/public" },
  @{ From = $SharedTeacherShellDir; To = "shared/teacher-shell" },
  @{ From = $SharedBuildDir; To = "shared/build" },
  @{ From = $SharedAssetsDir; To = "shared/assets" },
  @{ From = $CorePackagesDir; To = "core/packages" },
  @{ From = $NodeModulesDir; To = "node_modules" }
)) {
  if (Test-Path $entry.From) {
    $target = Join-Path $OutputRoot $entry.To
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    Copy-Item -Recurse -Force $entry.From $target
  }
}

$LoaderCandidates = @(
  (Join-Path $BuildRoot "native/shell/$Configuration/WebView2Loader.dll"),
  (Join-Path $BuildRoot "WebView2Loader.dll"),
  (Join-Path $RepoRoot "WebView2Loader.dll")
)

$Loader = $LoaderCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Loader) {
  Copy-Item -Force $Loader (Join-Path $OutputRoot "WebView2Loader.dll")
} else {
  Write-Warning "WebView2Loader.dll was not found. Copy it next to LumeSyncTeacherShell.exe before deployment."
}

Write-Host "[native-package] Output: $OutputRoot"
