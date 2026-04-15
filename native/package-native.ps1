param(
  [string]$Configuration = "Release",
  [string]$BuildDir = "build/native-vs",
  [string]$OutDir = "dist/teacher-native"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildRoot = Join-Path $RepoRoot $BuildDir
$OutputRoot = Join-Path $RepoRoot $OutDir
$StagingRoot = "$OutputRoot.staging"
$RuntimeDepsRoot = Join-Path $RepoRoot ".native-runtime-deps"
$RuntimeNodeModulesDir = Join-Path $RuntimeDepsRoot "node_modules"

$ShellExe = Join-Path $BuildRoot "native/shell/$Configuration/LumeSyncTeacherShell.exe"
$ServerDir = Join-Path $RepoRoot "server"
$SharedPublicDir = Join-Path $RepoRoot "shared/public"
$SharedTeacherShellDir = Join-Path $RepoRoot "shared/teacher-shell"
$SharedBuildDir = Join-Path $RepoRoot "shared/build"
$SharedAssetsDir = Join-Path $RepoRoot "shared/assets"
$CoreDir = if ($env:LUMESYNC_CORE_DIR) { Resolve-Path $env:LUMESYNC_CORE_DIR } else { Resolve-Path (Join-Path $RepoRoot "../core") }
$CorePackagesDir = Join-Path $CoreDir "packages"
$PackageJsonPath = Join-Path $RepoRoot "package.json"
$PackageLockPath = Join-Path $RepoRoot "package-lock.json"

function Stop-ProcessesUsingPath($TargetPath) {
  try {
    $normalized = [System.IO.Path]::GetFullPath($TargetPath)
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($normalized, [System.StringComparison]::OrdinalIgnoreCase)) -or
      ($_.CommandLine -and $_.CommandLine.Contains($normalized))
    }
    foreach ($process in $processes) {
      try {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      } catch {
        Write-Warning "Failed to stop process $($process.ProcessId): $($_.Exception.Message)"
      }
    }
  } catch {
    Write-Warning "Failed to inspect processes for ${TargetPath}: $($_.Exception.Message)"
  }
}

function Remove-DirectoryWithRetry($TargetPath, $MaxAttempts = 5) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if (-not (Test-Path $TargetPath)) { return }
      Remove-Item -Recurse -Force $TargetPath -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 1) {
        Stop-ProcessesUsingPath $TargetPath
      }
      if ($attempt -eq $MaxAttempts) {
        throw
      }
      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
}

function Prepare-RuntimeNodeModules {
  if (-not (Test-Path $PackageJsonPath)) {
    throw "Missing package.json: $PackageJsonPath"
  }

  if (Test-Path $RuntimeDepsRoot) {
    Remove-DirectoryWithRetry $RuntimeDepsRoot
  }

  New-Item -ItemType Directory -Force -Path $RuntimeDepsRoot | Out-Null
  Copy-Item -Force $PackageJsonPath (Join-Path $RuntimeDepsRoot "package.json")
  if (Test-Path $PackageLockPath) {
    Copy-Item -Force $PackageLockPath (Join-Path $RuntimeDepsRoot "package-lock.json")
  }

  Push-Location $RuntimeDepsRoot
  try {
    if (Test-Path (Join-Path $RuntimeDepsRoot "package-lock.json")) {
      npm ci --omit=dev --no-audit --no-fund | Out-Host
    } else {
      npm install --omit=dev --no-audit --no-fund | Out-Host
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $RuntimeNodeModulesDir)) {
    throw "Failed to prepare runtime node_modules at $RuntimeNodeModulesDir"
  }
}

if (-not (Test-Path $ShellExe)) {
  throw "Missing shell binary: $ShellExe"
}

Prepare-RuntimeNodeModules

if (Test-Path $StagingRoot) {
  Remove-DirectoryWithRetry $StagingRoot
}

New-Item -ItemType Directory -Force -Path $StagingRoot | Out-Null
Copy-Item -Force $ShellExe (Join-Path $StagingRoot "LumeSyncTeacherShell.exe")

foreach ($entry in @(
  @{ From = $ServerDir; To = "server" },
  @{ From = $SharedPublicDir; To = "shared/public" },
  @{ From = $SharedTeacherShellDir; To = "shared/teacher-shell" },
  @{ From = $SharedBuildDir; To = "shared/build" },
  @{ From = $SharedAssetsDir; To = "shared/assets" },
  @{ From = $CorePackagesDir; To = "core/packages" },
  @{ From = $RuntimeNodeModulesDir; To = "node_modules" }
)) {
  if (Test-Path $entry.From) {
    $target = Join-Path $StagingRoot $entry.To
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
  Copy-Item -Force $Loader (Join-Path $StagingRoot "WebView2Loader.dll")
} else {
  Write-Warning "WebView2Loader.dll was not found. Copy it next to LumeSyncTeacherShell.exe before deployment."
}

$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
}
if ($NodeCommand -and (Test-Path $NodeCommand.Source)) {
  Copy-Item -Force $NodeCommand.Source (Join-Path $StagingRoot "node.exe")
} else {
  Write-Warning "node.exe was not found in PATH. The installed teacher app may fail to start the local server on machines without Node.js."
}

$FinalOutput = $OutputRoot
if (Test-Path $OutputRoot) {
  try {
    Remove-DirectoryWithRetry $OutputRoot
    Move-Item -Force $StagingRoot $OutputRoot
  } catch {
    Write-Warning "Failed to replace $OutputRoot, keeping staging output at $StagingRoot. Error: $($_.Exception.Message)"
    $FinalOutput = $StagingRoot
  }
} else {
  Move-Item -Force $StagingRoot $OutputRoot
}

Write-Host "[native-package] Output: $FinalOutput"
if ($FinalOutput -ne $OutputRoot) {
  Write-Host "[native-package] Note: installer should use staging source: $FinalOutput"
}
