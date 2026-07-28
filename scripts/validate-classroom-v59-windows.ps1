$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/classroom-v59-windows"
$portableName = "Geometry-Tactical-Classroom-V59-59.0.0-Local-x64.exe"
$portable = Get-ChildItem $dist -Filter $portableName -File | Select-Object -First 1
if (-not $portable) { throw "Classroom V59 portable executable was not found." }
if ($portable.Length -lt 70000000) { throw "Classroom V59 executable is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($portable.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "The package does not have a Windows PE header." }

$ready = Join-Path $env:RUNNER_TEMP "v59-classroom-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "v59-classroom-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "v59-classroom-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "v59-classroom-stderr.log"
$errorFile = "classroom-v59-validation-error.log"
$process = $null

trap {
  $details = @(
    "Classroom V59 portable runtime validation failed.",
    "Exception: $($_.Exception.Message)",
    "Position: $($_.InvocationInfo.PositionMessage)",
    "Script stack: $($_.ScriptStackTrace)"
  ) -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(
    @($ready, "classroom-v59-ready-last.json"),
    @($vaultFile, "classroom-v59-vault-last.json"),
    @($stdoutFile, "classroom-v59-stdout.log"),
    @($stderrFile, "classroom-v59-stderr.log")
  )) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "Geometry Tactical Classroom V59*" -or
    $_.ProcessName -like "Geometry-Tactical-Classroom-V59*"
  } | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Error $details
  exit 1
}

Remove-Item $ready,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$env:V59_READY_FILE = $ready
$env:V59_SELF_TEST_FILE = $vaultFile
$env:V59_TEACHER_PIN = "9109"
$env:V59_ALLOW_SECOND_INSTANCE = "true"
$env:ELECTRON_ENABLE_LOGGING = "1"

$process = Start-Process $portable.FullName -WorkingDirectory $dist -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Classroom V59 PID=$($process.Id) PATH=$($portable.FullName) SIZE=$($portable.Length)" | Tee-Object classroom-v59-startup.log

$report = $null
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep 1
  if (Test-Path $ready) {
    try {
      $candidate = Get-Content $ready -Raw | ConvertFrom-Json
      if ($candidate.renderer.phase -eq "renderer-bootstrap") { $report = $candidate; break }
    } catch {}
  }
}
if (-not $report) {
  $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
  $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }
  throw "Classroom V59 did not produce a renderer-bootstrap readiness report. STDOUT=$stdout STDERR=$stderr"
}

if ($report.version -ne "59.0.0" -or $report.edition -ne "classroom-login-melee-question-bank-v59") { throw "Classroom V59 identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Core engine contract failed." }
if ($report.renderer.thrownWeaponLeavesHand -ne $true) { throw "Finite weapon-throw contract failed." }
if ($report.renderer.unarmedMeleeAttack -ne $true) { throw "Player melee contract failed." }
if ($report.renderer.eighthGradeGroupRequired -ne $true) { throw "Grade-group login contract failed." }
if ($report.renderer.editableLoginSpacebar -ne $true) { throw "Full-name spacebar contract failed." }
if ($report.renderer.proceduralQuestionBank -ne $true -or $report.renderer.repeatedQuestionGuard -ne $true) { throw "Question-bank variation contract failed." }
if ($report.renderer.rightTriangleCaseCount -lt 144) { throw "The procedural right-triangle bank is too small." }
if ($report.renderer.protectedResultsVault -ne $true -or $report.renderer.passwordGate -ne $true) { throw "Protected result controls were not reported." }
if ($report.renderer.questionSeconds -ne 60 -or $report.renderer.fixedMatchSeconds -ne 1200) { throw "Established assessment timing changed." }
if ($report.renderer.pauseAllowed -ne $false -or $report.renderer.answerRevealDisabled -ne $true) { throw "Assessment fairness contract changed." }

for ($i = 0; $i -lt 45 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
if ($vault.questionRecorded -ne $true -or $vault.scoreRecorded -ne $true -or $vault.groupRecorded -ne $true -or $vault.consolidatedStudentRows -ne 3) { throw "Protected classroom data checks failed." }

Get-Content $ready | Tee-Object classroom-v59-startup.log -Append
Get-Content $vaultFile | Tee-Object classroom-v59-startup.log -Append

Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -like "Geometry Tactical Classroom V59*" -or
  $_.ProcessName -like "Geometry-Tactical-Classroom-V59*"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 3

$hash = (Get-FileHash $portable.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $portableName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Classroom V59 validated: $portableName · $($portable.Length) bytes · SHA256 $hash" | Tee-Object classroom-v59-portable.log

@'
param([switch]$Run)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Geometry-Tactical-Classroom-V59-59.0.0-Local-x64.exe"
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
GEOMETRY TACTICAL CLASSROOM V59 · PORTABLE LOCAL VERSION

Recommended start:
1. Extract the ZIP completely.
2. Run RUN_LOCAL_VERIFIED.cmd to verify SHA-256 and start the game.
3. You may also open Geometry-Tactical-Classroom-V59-59.0.0-Local-x64.exe directly.

Registration:
- Enter three different full names. Spaces are supported.
- Select eighth-grade group 8°A, 8°B or 8°C.

Controls:
- Student 1: WASD movement.
- Student 2: mouse aim.
- Student 3: Space/F fire; Q melee; R reload; E pick up or throw; Shift dash.
- After E throws a weapon, it leaves the player's hand. Fight unarmed or recover a weapon.

Assessment:
- All generated figures are right triangles.
- Values, orientations and missing sides vary procedurally.
- A recent-question memory reduces repeated patterns.
- Mission time: 20 real minutes. Question time: 60 seconds.

Protected records:
- Names, answers and scores are encrypted locally with AES-256-GCM.
- Teacher Results PIN: 9109.
- No plaintext JSON or CSV student report is created.
- The application is offline and contains no analytics, telemetry, updater or external navigation.

This build is not commercially code-signed, so Windows may display Unknown publisher.
'@ | Set-Content "$dist/README_LOCAL.txt" -Encoding UTF8

$keep = @($portableName, "SHA256SUMS.txt", "VERIFY_LOCAL.ps1", "RUN_LOCAL_VERIFIED.cmd", "README_LOCAL.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
$remaining = Get-ChildItem $dist -File
if ($remaining.Count -ne 5) { throw "Classroom V59 package contains unexpected files." }
if (($remaining | Measure-Object Length -Sum).Sum -gt 110000000) { throw "Classroom V59 package is unexpectedly large." }
