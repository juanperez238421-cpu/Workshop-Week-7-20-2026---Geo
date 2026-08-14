$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/math-factorization-v60-boss-windows"
$installerName = "Math-Tactical-Classroom-V60.3-Boss-Setup-60.3.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer) { throw "Math Tactical V60.3 Boss Edition installer was not found." }
if ($installer.Length -lt 70000000) { throw "Math Tactical Boss Edition installer is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($installer.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "Installer does not have a Windows PE header." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV603BossEdition"
$ready = Join-Path $env:RUNNER_TEMP "math-v61-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v61-boss-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v61-question-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v61-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v61-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v61-stderr.log"
$errorFile = "math-v61-validation-error.log"

function Stop-MathApp {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "Math Tactical Classroom V60.3*" -or
    $_.ProcessName -like "Math-Tactical-Classroom-V60.3*"
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

trap {
  $details = @("Math Tactical V60.3 Boss Edition installed-runtime validation failed.", "Exception: $($_.Exception.Message)", "Position: $($_.InvocationInfo.PositionMessage)") -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(@($ready,"math-v61-ready-last.json"),@($bossReady,"math-v61-boss-last.json"),@($questionReady,"math-v61-question-last.json"),@($vaultFile,"math-v61-vault-last.json"),@($stdoutFile,"math-v61-stdout.log"),@($stderrFile,"math-v61-stderr.log"))) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  Stop-MathApp
  Write-Error $details
  exit 1
}

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$bossReady,$questionReady,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Silent installer returned exit code $($installProcess.ExitCode)." }

$installedExe = Get-ChildItem $installDir -Filter "*.exe" -File -Recurse | Where-Object { $_.Name -notmatch "(?i)uninstall" } | Sort-Object Length -Descending | Select-Object -First 1
if (-not $installedExe) { throw "Installed Math Tactical Boss Edition executable was not found." }
if ($installedExe.Length -lt 100000000) { throw "Installed application payload is unexpectedly small." }

$env:V60_READY_FILE = $ready
$env:V60_SELF_TEST_FILE = $vaultFile
$env:MATH_V60_TEACHER_PIN = "9109"
$env:V60_TEACHER_PIN = "9109"
$env:V60_ALLOW_SECOND_INSTANCE = "true"
$env:V60_BOSS_PROBE = "false"
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$env:ELECTRON_ENABLE_LOGGING = "1"
$process = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Math Tactical V60.3 Boss Edition installed PID=$($process.Id) PATH=$($installedExe.FullName) SIZE=$($installedExe.Length)" | Tee-Object math-v61-startup.log

$report = Wait-Ready $ready "renderer-bootstrap" 120
if ($report.version -ne "60.3.0" -or $report.edition -ne "math-factorization-boss-v61") { throw "Boss Edition identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Five-room engine contract failed." }
if ($report.renderer.fixedMatchSeconds -ne 1800) { throw "Mission duration is not 30 minutes." }
if ($report.renderer.factorizationCaseCount -ne 5 -or $report.renderer.fiveFactorizationCases -ne $true -or $report.renderer.factorizationFiveCasesOnly -ne $true) { throw "Five-case factorization contract failed." }
if ($report.renderer.factorizationInitialStepHelp -ne $true) { throw "Initial-step factorization help is missing." }
if ($report.renderer.room5FinalBoss -ne $true) { throw "Room 5 final boss readiness flag is missing." }
if ($report.renderer.bossRequiresThrownRoomWeapon -ne $false) { throw "Boss shield is still hard-gated behind a thrown room weapon." }
if ($report.renderer.bossShieldHitBased -ne $true -or $report.renderer.bossDashPattern -ne $true -or $report.renderer.bossPredictiveAim -ne $true -or $report.renderer.bossDynamicPatternCount -ne 4) { throw "Boss AI readiness contract failed." }
if ($report.renderer.floorRoomWeaponsPickable -ne $true) { throw "Floor weapon pickup readiness flag is missing." }
if ($report.renderer.protectedResultsVault -ne $true -or $report.renderer.passwordGate -ne $true -or $report.renderer.answerRevealDisabled -ne $true) { throw "Protected assessment contract failed." }

for ($i = 0; $i -lt 45 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
if ($vault.questionRecorded -ne $true -or $vault.scoreRecorded -ne $true -or $vault.groupRecorded -ne $true -or $vault.consolidatedStudentRows -ne 3) { throw "Protected classroom data checks failed." }
Stop-MathApp

Remove-Item $bossReady -Force -ErrorAction SilentlyContinue
$env:V60_READY_FILE = $bossReady
$env:V60_BOSS_PROBE = "true"
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$bossProcess = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
$boss = Wait-Ready $bossReady "room5-boss-probe" 120
if ($boss.renderer.bossPresent -ne $true -or $boss.renderer.bossHealthPhases -ne 3) { throw "Three-phase final boss was not instantiated correctly." }
if ($boss.renderer.bossShieldActive -ne $true -or $boss.renderer.bossShieldHitPoints -ne 4 -or $boss.renderer.bossShieldMaxHitPoints -ne 4) { throw "Phase 1 hit-based shield did not initialize at 4/4." }
if ($boss.renderer.bossShieldHitBased -ne $true -or $boss.renderer.bossShieldOneHitReduces -ne $true) { throw "One-hit shield reduction failed in the installed runtime." }
if ($boss.renderer.bossDashPattern -ne $true -or $boss.renderer.bossPredictiveAim -ne $true -or $boss.renderer.bossDynamicPatternCount -ne 4) { throw "Boss dash/prediction/pattern runtime contract failed." }
if ($boss.renderer.roomWeaponCount -lt 6 -or $boss.renderer.roomWeaponsPersistent -ne $true) { throw "Permanent floor weapon population failed." }
if ($boss.renderer.roomWeaponPickupFunctional -ne $true -or $boss.renderer.roomWeaponPickupRadius -lt 100) { throw "Actual floor weapon pickup failed in installed runtime." }
if ($boss.renderer.roomWeaponThrowsDealBonusShieldDamage -ne $true) { throw "Room weapon bonus shield damage is missing." }
if ($boss.renderer.bossRequiresThrownRoomWeapon -ne $false) { throw "Installed boss is still invulnerable without a room-weapon throw." }
Stop-MathApp

Remove-Item $questionReady -Force -ErrorAction SilentlyContinue
$env:V60_READY_FILE = $questionReady
$env:V60_BOSS_PROBE = "false"
$env:V60_QUESTION_PREVIEW = "general-trinomial"
$questionProcess = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
$question = Wait-Ready $questionReady "question-layout-preview" 120
if ($question.renderer.questionType -ne "general-trinomial") { throw "Factorization preview did not produce general-trinomial." }
if ($question.renderer.fiveFactorizationCases -ne $true -or $question.renderer.algebraicFactorizationCanvas -ne $true) { throw "Factorization preview contract failed." }
if ($question.renderer.factorizationInitialStepHelp -ne $true) { throw "Question preview does not expose initial-step help." }
if ($question.renderer.questionLayoutFitsViewport -ne $true) { throw "Question layout no longer fits the installed viewport." }
Stop-MathApp

Get-Content $ready | Tee-Object math-v61-startup.log -Append
Get-Content $bossReady | Tee-Object math-v61-startup.log -Append
Get-Content $questionReady | Tee-Object math-v61-startup.log -Append
Get-Content $vaultFile | Tee-Object math-v61-startup.log -Append

$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $installerName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Math Tactical V60.3 Boss Edition installer validated: $installerName · $($installer.Length) bytes · SHA256 $hash" | Tee-Object math-v61-installer.log

@'
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Math-Tactical-Classroom-V60.3-Boss-Setup-60.3.0-Local-x64.exe"
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
MATH TACTICAL CLASSROOM V60.3 · BOSS EDITION

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Final boss:
- Room 5 contains the three-phase ARCHIVE WARDEN.
- Shield is no longer invincible: phase shield strength is 4, 5 and 6 hits.
- Every successful projectile hit reduces shield by one.
- Permanent room weapons are physically displayed on the floor and picked up with E.
- Throwing floor room weapons deals 2–3 shield damage depending on weapon.
- Open core remains vulnerable for 5.5 seconds and requires one clean hit to advance the phase.
- Boss AI adds telegraphed predictive dashes, player-velocity prediction, heavy fan, predictive precision triple, radial ring and phase-3 predictive sweep patterns.

Assessment:
- Five procedural factorization cases remain active.
- Each question now contains AYUDA INICIAL with the first solving step, without revealing the final answer.

Normal enemies retain the fast 1–2 hit balance. Mission length remains 30 minutes with up to three 30-second pauses. Student data remains encrypted locally with AES-256-GCM in a Boss Edition vault separate from Geometry Tactical and the previous Math Tactical build. Teacher Results PIN: 9109.
'@ | Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8

$keep = @($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
if ((Get-ChildItem $dist -File).Count -ne 5) { throw "Boss Edition installer package contains unexpected files." }
