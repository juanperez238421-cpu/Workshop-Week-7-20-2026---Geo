$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/final-boss-clean-hud-v58-windows"
$setupName = "Geometry-Tactical-Final-School-V58-Setup-58.0.0-x64.exe"
$portableName = "Geometry-Tactical-Final-School-V58-58.0.0-Portable-x64.exe"
$setup = Get-ChildItem $dist -Filter $setupName -File | Select-Object -First 1
if (-not $setup) { throw "V58 installer was not found." }

$installDir = Join-Path $env:RUNNER_TEMP "V58SchoolInstall"
$ready = Join-Path $env:RUNNER_TEMP "v58-installed-ready.json"
$runtime = Join-Path $env:RUNNER_TEMP "v58-installed-runtime.log"
$vaultFile = Join-Path $env:RUNNER_TEMP "v58-installed-vault.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "v58-installed-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "v58-installed-stderr.log"
$errorFile = "final-boss-clean-hud-v58-validation-error.log"
$process = $null

trap {
  $details = @(
    "V58 installed runtime validation failed.",
    "Exception: $($_.Exception.Message)",
    "Position: $($_.InvocationInfo.PositionMessage)",
    "Script stack: $($_.ScriptStackTrace)"
  ) -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(
    @($ready, "final-boss-clean-hud-v58-ready-last.json"),
    @($runtime, "final-boss-clean-hud-v58-runtime.log"),
    @($stdoutFile, "final-boss-clean-hud-v58-stdout.log"),
    @($stderrFile, "final-boss-clean-hud-v58-stderr.log"),
    @($vaultFile, "final-boss-clean-hud-v58-vault-last.json")
  )) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  if ($process -and -not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
  Write-Error $details
  exit 1
}

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
$installer = Start-Process $setup.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installer.ExitCode -ne 0) { throw "Silent installation failed with code $($installer.ExitCode)." }

$exe = Get-ChildItem $installDir -Filter "Geometry Tactical Final School V58.exe" -File -Recurse | Select-Object -First 1
if (-not $exe) { throw "Installed V58 executable was not found." }

Remove-Item $ready,$runtime,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$env:V58_READY_FILE = $ready
$env:V58_STARTUP_LOG = $runtime
$env:V58_SELF_TEST_FILE = $vaultFile
$env:V58_TEST_PIN = "9109"
$env:V58_BOSS_PROBE = "true"
$env:V58_ALLOW_SECOND_INSTANCE = "true"
$env:ELECTRON_ENABLE_LOGGING = "1"

$process = Start-Process $exe.FullName -WorkingDirectory $installDir -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Installed PID=$($process.Id) PATH=$($exe.FullName)" | Tee-Object final-boss-clean-hud-v58-startup.log
$report = $null
$fallbackReady = Join-Path $env:APPDATA "Geometry Tactical Clean Vision Local\ready-v58.json"
for ($i = 0; $i -lt 100; $i++) {
  Start-Sleep 1
  $process.Refresh()
  if ($process.HasExited) {
    $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
    $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }
    throw "Installed application exited with code $($process.ExitCode). STDOUT=$stdout STDERR=$stderr"
  }
  foreach ($candidatePath in @($ready, $fallbackReady)) {
    if (-not (Test-Path $candidatePath)) { continue }
    try {
      $candidate = Get-Content $candidatePath -Raw | ConvertFrom-Json
      if ($candidate.renderer.phase -eq "room5-boss-probe") { $report = $candidate; $ready = $candidatePath; break }
    } catch {}
  }
  if ($report) { break }
}
if (-not $report) { throw "Installed V58 did not reach the Room 5 boss probe." }

if ($report.version -ne "58.0.0" -or $report.edition -ne "final-boss-clean-hud-v58") { throw "Installed V58 identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Installed engine contract failed." }
if ($report.renderer.cleanEssentialHud -ne $true -or $report.renderer.cleanTopMetrics -lt 4) { throw "Clean essential HUD was not reported." }
if ($report.renderer.bossPresent -ne $true -or $report.renderer.bossHealthPhases -lt 3) { throw "Room 5 final boss is missing or incomplete." }
if ($report.renderer.bossShieldActive -ne $true -or $report.renderer.roomWeaponCount -lt 4) { throw "Boss shield or room weapons are missing." }
if ($report.renderer.eKeyPickupAndThrow -ne $true -or $report.renderer.bossRequiresThrownRoomWeapon -ne $true) { throw "E-key boss interaction contract failed." }
if ($report.renderer.wallClockMissionDeadline -ne $true -or $report.renderer.fairRetryStudentRotation -ne $true) { throw "Assessment fairness contract failed." }
if ($report.renderer.bossHudPresent -ne $true -or $report.renderer.interactionPromptPresent -ne $true) { throw "Boss HUD or interaction clue is missing." }
if ($report.renderer.questionSeconds -ne 60 -or $report.renderer.fixedMatchSeconds -ne 1200) { throw "Established timing contract changed." }
if ($report.renderer.pauseAllowed -ne $false -or $report.renderer.answerRevealDisabled -ne $true) { throw "No-pause or answer-nondisclosure contract changed." }
if ($report.renderer.offlineOnly -ne $true -or $report.renderer.schoolPcHardening -ne $true) { throw "Offline school-PC hardening was not reported." }
if ($report.renderer.protectedResultsVault -ne $true -or $report.renderer.passwordGate -ne $true) { throw "Protected results controls were not reported." }

for ($i = 0; $i -lt 30 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
if ($vault.questionRecorded -ne $true -or $vault.scoreRecorded -ne $true -or $vault.consolidatedStudentRows -lt 3) { throw "Student data consolidation checks failed." }

Get-Content $ready | Tee-Object final-boss-clean-hud-v58-startup.log -Append
Get-Content $vaultFile | Tee-Object final-boss-clean-hud-v58-startup.log -Append
if (Test-Path $runtime) { Get-Content $runtime | Tee-Object final-boss-clean-hud-v58-startup.log -Append }
& taskkill.exe /PID $process.Id /T /F | Out-Null
Start-Sleep 3

$portable = Get-ChildItem $dist -Filter $portableName -File | Select-Object -First 1
if (-not $portable) { throw "Portable V58 executable was not found." }
if ($portable.Length -lt 80000000) { throw "Portable executable is unexpectedly small." }
$stream = [System.IO.File]::OpenRead($portable.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "Portable executable does not have a Windows PE header." }
"Portable file validated: $($portable.Name) · $($portable.Length) bytes" | Tee-Object final-boss-clean-hud-v58-portable.log

Remove-Item "$dist/SHA256SUMS.txt" -Force -ErrorAction SilentlyContinue
Get-ChildItem $dist -Filter *.exe | ForEach-Object {
  $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
  "$hash  $($_.Name)" | Out-File "$dist/SHA256SUMS.txt" -Append -Encoding ascii
}

@'
param([string]$FileName,[switch]$Run)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root $FileName
$line = Get-Content (Join-Path $root "SHA256SUMS.txt") | Where-Object { $_ -match [regex]::Escape($FileName) } | Select-Object -First 1
if (-not (Test-Path $target) -or -not $line) { throw "Verification target or checksum is missing." }
$expected = ($line -split "\s+")[0].ToLowerInvariant()
$actual = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { Write-Host "CHECKSUM FAILED. Do not run this file." -ForegroundColor Red; exit 2 }
Write-Host "SHA-256 verified: $FileName" -ForegroundColor Green
if ($Run) { Start-Process $target }
'@ | Set-Content "$dist/VERIFY_FILE.ps1" -Encoding UTF8

@"
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_FILE.ps1" -FileName "$setupName" -Run
if errorlevel 1 (pause & exit /b 1)
"@ | Set-Content "$dist/INSTALL_VERIFIED_FROM_USB.cmd" -Encoding ASCII

@"
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_FILE.ps1" -FileName "$portableName" -Run
if errorlevel 1 (pause & exit /b 1)
"@ | Set-Content "$dist/RUN_PORTABLE_VERIFIED.cmd" -Encoding ASCII

@'
GEOMETRY TACTICAL FINAL SCHOOL V58 · OFFLINE USB KIT

Copy this complete folder from the USB drive to each school PC.
Run INSTALL_VERIFIED_FROM_USB.cmd for normal per-user installation.
Run RUN_PORTABLE_VERIFIED.cmd to use the game without installation.
Both scripts verify SHA-256 before launch.

V58 includes five rooms and a high-contrast clean player HUD showing only essential information.
Room 5 is the Final Archive Warden boss encounter.
The boss shield ignores bullets. Move near a room weapon and press E to pick it up; aim and press E again to throw it into the shield. When the core opens, fire normally. Repeat for all three phases.

The mission uses a real wall-clock 20-minute deadline. Geometry questions allow 60 seconds and retries rotate fairly among the three registered students.
Teacher Results PIN: 9109.

Student names, answers and scores are encrypted locally with AES-256-GCM and a Windows-protected key.
The game is offline and contains no analytics, telemetry, cloud upload, updater or external navigation.
This build is not commercially code-signed, so Windows may display Unknown publisher.
School IT should verify SHA256SUMS.txt before approval.
'@ | Set-Content "$dist/README_SCHOOL_USB.txt" -Encoding UTF8
