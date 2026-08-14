$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/math-factorization-v60-relentless-windows"
$installerName = "Math-Tactical-Classroom-V60.5-Relentless-Boss-Setup-60.5.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer) { throw "Math Tactical V60.5 Relentless Boss installer was not found." }
if ($installer.Length -lt 70000000) { throw "V60.5 installer is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($installer.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "Installer does not have a Windows PE header." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV605RelentlessBoss"
$ready = Join-Path $env:RUNNER_TEMP "math-v605-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v605-boss-ready.json"
$teacherReady = Join-Path $env:RUNNER_TEMP "math-v605-teacher-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v605-question-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v605-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v605-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v605-stderr.log"
$errorFile = "math-v605-validation-error.log"

function Stop-MathApp {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "Math Tactical Classroom V60.5*" -or
    $_.ProcessName -like "Math-Tactical-Classroom-V60.5*"
  } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
}

function Wait-Ready([string]$File, [string]$Phase, [int]$Seconds = 120) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    Start-Sleep 1
    if (Test-Path $File) {
      try {
        $candidate = Get-Content $File -Raw | ConvertFrom-Json
        if ($candidate.renderer.phase -eq $Phase) { return $candidate }
      } catch {}
    }
  }
  throw "Timed out waiting for renderer phase $Phase."
}

function Launch-MathApp([string]$ReadyFile) {
  $env:V60_READY_FILE = $ReadyFile
  return Start-Process $script:installedExe.FullName -WorkingDirectory $script:installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
}

trap {
  $details = @("Math Tactical V60.5 installed-runtime validation failed.", "Exception: $($_.Exception.Message)", "Position: $($_.InvocationInfo.PositionMessage)") -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(@($ready,"math-v605-ready-last.json"),@($bossReady,"math-v605-boss-last.json"),@($teacherReady,"math-v605-teacher-last.json"),@($questionReady,"math-v605-question-last.json"),@($vaultFile,"math-v605-vault-last.json"),@($stdoutFile,"math-v605-stdout.log"),@($stderrFile,"math-v605-stderr.log"))) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  Stop-MathApp
  Write-Error $details
  exit 1
}

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$bossReady,$teacherReady,$questionReady,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Silent installer returned exit code $($installProcess.ExitCode)." }

$script:installedExe = Get-ChildItem $installDir -Filter "*.exe" -File -Recurse | Where-Object { $_.Name -notmatch "(?i)uninstall" } | Sort-Object Length -Descending | Select-Object -First 1
if (-not $script:installedExe) { throw "Installed V60.5 executable was not found." }
if ($script:installedExe.Length -lt 100000000) { throw "Installed application payload is unexpectedly small." }

$env:V60_SELF_TEST_FILE = $vaultFile
$env:MATH_V60_TEACHER_PIN = "9109"
$env:V60_TEACHER_PIN = "9109"
$env:V60_ALLOW_SECOND_INSTANCE = "true"
$env:ELECTRON_ENABLE_LOGGING = "1"
$env:V60_BOSS_PROBE = "false"
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue

$normal = Launch-MathApp $ready
$report = Wait-Ready $ready "renderer-bootstrap" 120
if ($report.version -ne "60.5.0" -or $report.edition -ne "math-factorization-relentless-boss-v605") { throw "V60.5 identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Five-room engine contract failed." }
if ($report.renderer.fixedMatchSeconds -ne 2700 -or $report.renderer.questionSeconds -ne 90) { throw "45-minute / 90-second timing contract failed." }
if ($report.renderer.teacherModeAvailable -ne $true -or $report.renderer.teacherRoomCount -ne 5 -or $report.renderer.teacherDirectRoomAccess -ne $true) { throw "Teacher mode regressed." }
if ($report.renderer.factorizationCaseCount -ne 5 -or $report.renderer.factorizationInitialStepHelp -ne $true) { throw "Factorization contract regressed." }
if ($report.renderer.room5FinalBoss -ne $true -or $report.renderer.bossImmediateEngage -ne $true -or $report.renderer.bossRelentlessRushCycles -ne $true -or $report.renderer.bossFatigueCounterWindow -ne $true) { throw "Relentless boss readiness flags are missing." }
$chains = @($report.renderer.bossDashChainsByPhase)
if ($chains.Count -ne 3 -or $chains[0] -ne 3 -or $chains[1] -ne 5 -or $chains[2] -ne 7) { throw "Bootstrap does not report 3/5/7 boss dash chains." }
$speeds = @($report.renderer.bossDashSpeedsByPhase)
if ($speeds[0] -ne 760 -or $speeds[1] -ne 940 -or $speeds[2] -ne 1120) { throw "Bootstrap boss dash speeds are incorrect." }
if ($report.renderer.bossDynamicPatternCount -ne 6) { throw "Boss pressure pattern count is not 6." }

for ($i = 0; $i -lt 45 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
Stop-MathApp

Remove-Item $bossReady -Force -ErrorAction SilentlyContinue
$env:V60_BOSS_PROBE = "true"
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$bossProcess = Launch-MathApp $bossReady
$boss = Wait-Ready $bossReady "room5-boss-probe" 120
if ($boss.renderer.bossPresent -ne $true -or $boss.renderer.bossHealthPhases -ne 3) { throw "Final boss did not instantiate with three phases." }
if ($boss.renderer.bossOpeningDashActive -ne $true -or $boss.renderer.bossRoomDeploymentGraceSeconds -ne 0) { throw "Boss fight does not begin immediately." }
if ($boss.renderer.bossImmediateEngage -ne $true -or $boss.renderer.bossRelentlessRushCycles -ne $true -or $boss.renderer.bossFatigueCounterWindow -ne $true) { throw "Relentless runtime behavior markers failed." }
$bossChains = @($boss.renderer.bossDashChainsByPhase)
if ($bossChains[0] -ne 3 -or $bossChains[1] -ne 5 -or $bossChains[2] -ne 7) { throw "Installed boss does not expose 3/5/7 dash escalation." }
$bossSpeeds = @($boss.renderer.bossDashSpeedsByPhase)
if ($bossSpeeds[0] -ne 760 -or $bossSpeeds[1] -ne 940 -or $bossSpeeds[2] -ne 1120) { throw "Installed boss dash speed escalation is incorrect." }
$steer = @($boss.renderer.bossDashSteeringByPhase)
if ($steer[0] -ne 0 -or $steer[1] -lt 0.5 -or $steer[2] -lt 1.0) { throw "Predictive steering escalation is missing." }
$fatigue = @($boss.renderer.bossFatigueSecondsByPhase)
if ($fatigue[0] -le $fatigue[1] -or $fatigue[1] -le $fatigue[2]) { throw "Fatigue windows should shorten as phases intensify." }
if ($boss.renderer.bossShieldHitBased -ne $true -or $boss.renderer.bossShieldOneHitReduces -ne $true -or $boss.renderer.bossRequiresThrownRoomWeapon -ne $false) { throw "Killable hit-based shield regressed." }
if ($boss.renderer.roomWeaponPickupFunctional -ne $true -or $boss.renderer.roomWeaponCount -lt 6 -or $boss.renderer.roomWeaponsPersistent -ne $true) { throw "Floor weapon pickup regressed." }
Stop-MathApp

Remove-Item $teacherReady -Force -ErrorAction SilentlyContinue
$env:V60_BOSS_PROBE = "false"
$env:V60_TEACHER_PROBE = "5"
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$teacherProcess = Launch-MathApp $teacherReady
$teacher = Wait-Ready $teacherReady "teacher-room-probe" 120
if ($teacher.renderer.teacherMode -ne $true -or $teacher.renderer.currentRoom -ne 5 -or $teacher.renderer.teacherRoomCount -ne 5) { throw "Teacher direct access to Room 5 failed." }
if ($teacher.renderer.teacherSessionsExcludedFromGrades -ne $true) { throw "Teacher sessions are not excluded from grades." }
Stop-MathApp

Remove-Item $questionReady -Force -ErrorAction SilentlyContinue
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue
$env:V60_QUESTION_PREVIEW = "general-trinomial"
$questionProcess = Launch-MathApp $questionReady
$question = Wait-Ready $questionReady "question-layout-preview" 120
if ($question.renderer.questionSeconds -ne 90 -or $question.renderer.factorizationInitialStepHelp -ne $true -or $question.renderer.questionLayoutFitsViewport -ne $true) { throw "Factorization question runtime regressed." }
Stop-MathApp

Get-Content $ready | Tee-Object math-v605-startup.log -Append
Get-Content $bossReady | Tee-Object math-v605-startup.log -Append
Get-Content $teacherReady | Tee-Object math-v605-startup.log -Append
Get-Content $questionReady | Tee-Object math-v605-startup.log -Append
Get-Content $vaultFile | Tee-Object math-v605-startup.log -Append

$uninstaller = Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse | Select-Object -First 1
if ($uninstaller) {
  $uninstallProcess = Start-Process $uninstaller.FullName -ArgumentList @("/S") -Wait -PassThru
  if ($uninstallProcess.ExitCode -ne 0) { throw "Silent uninstaller failed." }
}

$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $installerName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Math Tactical V60.5 Relentless Boss installer validated: $installerName · $($installer.Length) bytes · SHA256 $hash" | Tee-Object math-v605-installer.log

@'
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Math-Tactical-Classroom-V60.5-Relentless-Boss-Setup-60.5.0-Local-x64.exe"
$target = Join-Path $root $fileName
$line = Get-Content (Join-Path $root "SHA256SUMS.txt") | Select-Object -First 1
if (-not (Test-Path $target) -or -not $line) { throw "Installer or checksum is missing." }
$expected = ($line -split "\s+")[0].ToLowerInvariant()
$actual = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { Write-Host "CHECKSUM FAILED. Do not install this file." -ForegroundColor Red; exit 2 }
Write-Host "SHA-256 verified: $fileName" -ForegroundColor Green
if ($Install) { Start-Process $target }
'@ | Set-Content "$dist/VERIFY_INSTALLER.ps1" -Encoding UTF8

@'
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_INSTALLER.ps1" -Install
if errorlevel 1 (pause & exit /b 1)
'@ | Set-Content "$dist/INSTALL_VERIFIED.cmd" -Encoding ASCII

@'
MATH TACTICAL CLASSROOM V60.5 · RELENTLESS BOSS EDITION

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Boss fight:
- Room 5 starts immediately: no three-second safe deployment delay.
- The Archive Warden opens with a predictive dash directly at the player.
- Phase 1: 3-dash rush, speed 760.
- Phase 2: 5-dash rush, speed 940, predictive steering and stronger projectile pressure.
- Phase 3: 7-dash rush, speed 1120, strongest steering and projectile pressure.
- The boss predicts movement from both current velocity and observed recent movement.
- During each rush the player must keep moving, break the shield under pressure, or survive until the Warden becomes tired.
- Fatigue windows shorten each phase: 2.25 s, 1.55 s, 0.95 s.
- Shield remains hit-based and killable; room-weapon throws are bonuses, never mandatory invulnerability keys.

Preserved:
- 45-minute mission.
- 90 seconds per factorization question with AYUDA INICIAL.
- PIN-protected Teacher Mode with direct Rooms 1–5 access and F8 switching.
- Fast 1–2 hit normal enemies.
- Permanent floor weapons in the boss room.
- Encrypted local student results.
'@ | Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8

$keep = @($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
if ((Get-ChildItem $dist -File).Count -ne 5) { throw "V60.5 installer package contains unexpected files." }
