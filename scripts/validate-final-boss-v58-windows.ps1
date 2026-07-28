$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/final-boss-clean-hud-v58-windows"
$portableName = "Geometry-Tactical-Final-School-V58-58.0.0-Local-x64.exe"
$portable = Get-ChildItem $dist -Filter $portableName -File | Select-Object -First 1
if (-not $portable) { throw "Compact V58 local executable was not found." }
if ($portable.Length -lt 70000000) { throw "Local executable is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($portable.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "Local executable does not have a Windows PE header." }

$ready = Join-Path $env:RUNNER_TEMP "v58-local-ready.json"
$runtime = Join-Path $env:RUNNER_TEMP "v58-local-runtime.log"
$vaultFile = Join-Path $env:RUNNER_TEMP "v58-local-vault.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "v58-local-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "v58-local-stderr.log"
$errorFile = "final-boss-clean-hud-v58-validation-error.log"
$fallbackReady = Join-Path $env:APPDATA "Geometry Tactical Clean Vision Local\ready-v58.json"
$process = $null

trap {
  $details = @(
    "V58 local portable runtime validation failed.",
    "Exception: $($_.Exception.Message)",
    "Position: $($_.InvocationInfo.PositionMessage)",
    "Script stack: $($_.ScriptStackTrace)"
  ) -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(
    @($ready, "final-boss-clean-hud-v58-ready-last.json"),
    @($fallbackReady, "final-boss-clean-hud-v58-fallback-ready-last.json"),
    @($runtime, "final-boss-clean-hud-v58-runtime.log"),
    @($stdoutFile, "final-boss-clean-hud-v58-stdout.log"),
    @($stderrFile, "final-boss-clean-hud-v58-stderr.log"),
    @($vaultFile, "final-boss-clean-hud-v58-vault-last.json")
  )) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "Geometry Tactical Final School V58*" -or
    $_.ProcessName -like "Geometry-Tactical-Final-School-V58*"
  } | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Error $details
  exit 1
}

Remove-Item $ready,$runtime,$vaultFile,$stdoutFile,$stderrFile,$fallbackReady -Force -ErrorAction SilentlyContinue
$env:V58_READY_FILE = $ready
$env:V58_STARTUP_LOG = $runtime
$env:V58_SELF_TEST_FILE = $vaultFile
$env:V58_TEST_PIN = "9109"
$env:V58_BOSS_PROBE = "true"
$env:V58_ALLOW_SECOND_INSTANCE = "true"
$env:ELECTRON_ENABLE_LOGGING = "1"

$process = Start-Process $portable.FullName -WorkingDirectory $dist -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Local portable PID=$($process.Id) PATH=$($portable.FullName) SIZE=$($portable.Length)" | Tee-Object final-boss-clean-hud-v58-startup.log

$report = $null
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep 1
  foreach ($candidatePath in @($ready, $fallbackReady)) {
    if (-not (Test-Path $candidatePath)) { continue }
    try {
      $candidate = Get-Content $candidatePath -Raw | ConvertFrom-Json
      if ($candidate.renderer.phase -eq "room5-boss-probe") {
        $report = $candidate
        $ready = $candidatePath
        break
      }
    } catch {}
  }
  if ($report) { break }
}
if (-not $report) {
  $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
  $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }
  throw "Local V58 did not reach the Room 5 boss probe. STDOUT=$stdout STDERR=$stderr"
}

if ($report.version -ne "58.0.0" -or $report.edition -ne "final-boss-clean-hud-v58") { throw "Local V58 identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Installed engine contract failed." }
if ($report.renderer.cleanEssentialHud -ne $true -or $report.renderer.cleanTopMetrics -lt 3) { throw "Clean essential HUD was not reported." }
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

Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -like "Geometry Tactical Final School V58*" -or
  $_.ProcessName -like "Geometry-Tactical-Final-School-V58*"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 3

$hash = (Get-FileHash $portable.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $portableName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Local portable validated: $portableName · $($portable.Length) bytes · SHA256 $hash" | Tee-Object final-boss-clean-hud-v58-portable.log

@'
param([switch]$Run)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Geometry-Tactical-Final-School-V58-58.0.0-Local-x64.exe"
$target = Join-Path $root $fileName
$line = Get-Content (Join-Path $root "SHA256SUMS.txt") | Select-Object -First 1
if (-not (Test-Path $target) -or -not $line) { throw "Local executable or checksum is missing." }
$expected = ($line -split "\s+")[0].ToLowerInvariant()
$actual = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { Write-Host "CHECKSUM FAILED. Do not run this file." -ForegroundColor Red; exit 2 }
Write-Host "SHA-256 verified: $fileName" -ForegroundColor Green
if ($Run) { Start-Process $target }
'@ | Set-Content "$dist/VERIFY_LOCAL.ps1" -Encoding UTF8

@'
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_LOCAL.ps1" -Run
if errorlevel 1 (pause & exit /b 1)
'@ | Set-Content "$dist/RUN_LOCAL_VERIFIED.cmd" -Encoding ASCII

@'
GEOMETRY TACTICAL FINAL SCHOOL V58 · COMPACT LOCAL VERSION

This package contains only the portable local Windows application. It does not include the duplicated installer, USB deployment package or unpacked Electron runtime.

Recommended start:
1. Extract the ZIP completely.
2. Run RUN_LOCAL_VERIFIED.cmd to verify SHA-256 and start the game.
3. You may also open Geometry-Tactical-Final-School-V58-58.0.0-Local-x64.exe directly.

Room 5 is the Final Archive Warden boss encounter. The shield ignores bullets. Move near a room weapon and press E to pick it up; aim and press E again to throw it into the shield. When the core opens, fire normally. Repeat through all three phases.

Mission time: 20 real minutes. Question time: 60 seconds. Teacher Results PIN: 9109.
Student names, answers and scores remain encrypted locally with AES-256-GCM.
The application is offline and contains no analytics, telemetry, updater or external navigation.
This build is not commercially code-signed, so Windows may display Unknown publisher.
'@ | Set-Content "$dist/README_LOCAL.txt" -Encoding UTF8

$keep = @($portableName, "SHA256SUMS.txt", "VERIFY_LOCAL.ps1", "RUN_LOCAL_VERIFIED.cmd", "README_LOCAL.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force

$remaining = Get-ChildItem $dist -File
if ($remaining.Count -ne 5) { throw "Compact local package contains unexpected files." }
if (($remaining | Measure-Object Length -Sum).Sum -gt 130000000) { throw "Compact local package is still too large." }
