$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/math-factorization-v60-teacher-windows"
$installerName = "Math-Tactical-Classroom-V60.4-Teacher-Setup-60.4.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer) { throw "Math Tactical V60.4 Teacher Edition installer was not found." }
if ($installer.Length -lt 70000000) { throw "Math Tactical V60.4 installer is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($installer.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "Installer does not have a Windows PE header." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV604TeacherEdition"
$ready = Join-Path $env:RUNNER_TEMP "math-v604-ready.json"
$teacherReady = Join-Path $env:RUNNER_TEMP "math-v604-teacher-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v604-question-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v604-boss-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v604-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v604-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v604-stderr.log"
$errorFile = "math-v604-validation-error.log"

function Stop-MathApp {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "Math Tactical Classroom V60.4*" -or
    $_.ProcessName -like "Math-Tactical-Classroom-V60.4*"
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
  $process = Start-Process $script:installedExe.FullName -WorkingDirectory $script:installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
  "Math Tactical V60.4 PID=$($process.Id) PATH=$($script:installedExe.FullName) SIZE=$($script:installedExe.Length)" | Tee-Object math-v604-startup.log -Append
  return $process
}

trap {
  $details = @("Math Tactical V60.4 Teacher Edition installed-runtime validation failed.", "Exception: $($_.Exception.Message)", "Position: $($_.InvocationInfo.PositionMessage)") -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(@($ready,"math-v604-ready-last.json"),@($teacherReady,"math-v604-teacher-last.json"),@($questionReady,"math-v604-question-last.json"),@($bossReady,"math-v604-boss-last.json"),@($vaultFile,"math-v604-vault-last.json"),@($stdoutFile,"math-v604-stdout.log"),@($stderrFile,"math-v604-stderr.log"))) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  Stop-MathApp
  Write-Error $details
  exit 1
}

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$teacherReady,$questionReady,$bossReady,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Silent installer returned exit code $($installProcess.ExitCode)." }

$script:installedExe = Get-ChildItem $installDir -Filter "*.exe" -File -Recurse | Where-Object { $_.Name -notmatch "(?i)uninstall" } | Sort-Object Length -Descending | Select-Object -First 1
if (-not $script:installedExe) { throw "Installed Math Tactical V60.4 executable was not found." }
if ($script:installedExe.Length -lt 100000000) { throw "Installed application payload is unexpectedly small." }

$env:V60_SELF_TEST_FILE = $vaultFile
$env:MATH_V60_TEACHER_PIN = "9109"
$env:V60_TEACHER_PIN = "9109"
$env:V60_ALLOW_SECOND_INSTANCE = "true"
$env:V60_BOSS_PROBE = "false"
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$env:ELECTRON_ENABLE_LOGGING = "1"

$normal = Launch-MathApp $ready
$report = Wait-Ready $ready "renderer-bootstrap" 120
if ($report.version -ne "60.4.0" -or $report.edition -ne "math-factorization-teacher-v604") { throw "V60.4 Teacher Edition identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Five-room engine contract failed." }
if ($report.renderer.fixedMatchSeconds -ne 2700) { throw "Mission duration is not 45 minutes." }
if ($report.renderer.questionSeconds -ne 90) { throw "Question duration is not 90 seconds." }
if ($report.renderer.factorizationCaseCount -ne 5 -or $report.renderer.fiveFactorizationCases -ne $true -or $report.renderer.factorizationFiveCasesOnly -ne $true) { throw "Five-case factorization contract failed." }
if ($report.renderer.factorizationInitialStepHelp -ne $true) { throw "Initial-step factorization help regressed." }
if ($report.renderer.teacherModeAvailable -ne $true -or $report.renderer.teacherRoomCount -ne 5 -or $report.renderer.teacherDirectRoomAccess -ne $true -or $report.renderer.teacherModePinProtected -ne $true) { throw "Teacher Mode readiness contract failed." }
if ($report.renderer.room5FinalBoss -ne $true -or $report.renderer.bossShieldHitBased -ne $true -or $report.renderer.bossDashPattern -ne $true -or $report.renderer.bossPredictiveAim -ne $true) { throw "V60.3 final boss AI contract regressed." }
if ($report.renderer.floorRoomWeaponsPickable -ne $true) { throw "Boss-room floor weapon pickup contract regressed." }
if ($report.renderer.protectedResultsVault -ne $true -or $report.renderer.passwordGate -ne $true -or $report.renderer.answerRevealDisabled -ne $true) { throw "Protected assessment contract failed." }

for ($i = 0; $i -lt 45 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
Stop-MathApp

Remove-Item $teacherReady -Force -ErrorAction SilentlyContinue
$env:V60_TEACHER_PROBE = "4"
$env:V60_BOSS_PROBE = "false"
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$teacherProcess = Launch-MathApp $teacherReady
$teacher = Wait-Ready $teacherReady "teacher-room-probe" 120
if ($teacher.version -ne "60.4.0") { throw "Teacher probe launched the wrong version." }
if ($teacher.renderer.teacherMode -ne $true -or $teacher.renderer.directRoomAccess -ne $true) { throw "Teacher direct-room mode did not activate." }
if ($teacher.renderer.teacherRoomCount -ne 5 -or $teacher.renderer.requestedRoom -ne 4 -or $teacher.renderer.currentRoom -ne 4) { throw "Teacher Mode could not directly access Room 4." }
if ($teacher.renderer.fixedMatchSeconds -ne 2700 -or $teacher.renderer.questionSeconds -ne 90) { throw "Teacher Mode did not inherit the 45-minute / 90-second timers." }
if ($teacher.renderer.teacherSessionsExcludedFromGrades -ne $true) { throw "Teacher test sessions are not excluded from student grading." }
Stop-MathApp

Remove-Item $questionReady -Force -ErrorAction SilentlyContinue
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue
$env:V60_QUESTION_PREVIEW = "common-factor"
$questionProcess = Launch-MathApp $questionReady
$question = Wait-Ready $questionReady "question-layout-preview" 120
$allowedQuestionTypes = @("common-factor","grouping","difference-squares","perfect-square-trinomial","general-trinomial")
if ($allowedQuestionTypes -notcontains $question.renderer.questionType) { throw "Factorization preview did not produce a valid factorization case." }
if ($question.renderer.questionSeconds -ne 90) { throw "Installed factorization question countdown is not 90 seconds." }
if ($question.renderer.factorizationInitialStepHelp -ne $true -or $question.renderer.fiveFactorizationCases -ne $true -or $question.renderer.algebraicFactorizationCanvas -ne $true) { throw "Factorization question UI contract failed." }
if ($question.renderer.questionLayoutFitsViewport -ne $true) { throw "Factorization question layout no longer fits the installed viewport." }
Stop-MathApp

Remove-Item $bossReady -Force -ErrorAction SilentlyContinue
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$env:V60_BOSS_PROBE = "true"
$bossProcess = Launch-MathApp $bossReady
$boss = Wait-Ready $bossReady "room5-boss-probe" 120
if ($boss.renderer.bossPresent -ne $true -or $boss.renderer.bossHealthPhases -ne 3) { throw "Three-phase final boss did not instantiate correctly." }
if ($boss.renderer.bossShieldHitBased -ne $true -or $boss.renderer.bossShieldOneHitReduces -ne $true) { throw "Hit-based final-boss shield regressed." }
if ($boss.renderer.bossDashPattern -ne $true -or $boss.renderer.bossPredictiveAim -ne $true -or $boss.renderer.bossDynamicPatternCount -ne 4) { throw "Boss dash/prediction/pattern AI regressed." }
if ($boss.renderer.roomWeaponPickupFunctional -ne $true -or $boss.renderer.roomWeaponCount -lt 6 -or $boss.renderer.roomWeaponsPersistent -ne $true) { throw "Permanent floor weapon pickup regressed." }
Stop-MathApp

Get-Content $ready | Tee-Object math-v604-startup.log -Append
Get-Content $teacherReady | Tee-Object math-v604-startup.log -Append
Get-Content $questionReady | Tee-Object math-v604-startup.log -Append
Get-Content $bossReady | Tee-Object math-v604-startup.log -Append
Get-Content $vaultFile | Tee-Object math-v604-startup.log -Append

$uninstaller = Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse | Select-Object -First 1
if ($uninstaller) {
  $uninstallProcess = Start-Process $uninstaller.FullName -ArgumentList @("/S") -Wait -PassThru
  if ($uninstallProcess.ExitCode -ne 0) { throw "Silent uninstaller failed." }
}

$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $installerName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Math Tactical V60.4 Teacher Edition installer validated: $installerName · $($installer.Length) bytes · SHA256 $hash" | Tee-Object math-v604-installer.log

@'
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Math-Tactical-Classroom-V60.4-Teacher-Setup-60.4.0-Local-x64.exe"
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
MATH TACTICAL CLASSROOM V60.4 · TEACHER EDITION

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Timing:
- Full mission: 45 minutes.
- Each factorization question: 90 seconds (1:30).
- Mission clock continues during questions and freezes only during the existing controlled pauses.

Teacher Mode:
- From the registration screen choose MODO DOCENTE · SALAS 1–5.
- Enter the teacher PIN.
- Open any of Rooms 1, 2, 3, 4 or 5 directly.
- During a teacher session press F8 to reopen the room selector and jump to another room.
- Teacher-mode sessions are demonstrations/tests and are not written as student grades.

Gameplay preserved from V60.3:
- Fast 1–2 hit normal enemies.
- Three-phase ARCHIVE WARDEN final boss.
- Hit-based boss shields, predictive dash AI and four escalating attack patterns.
- Permanent boss-room weapons on the floor, pickable with E.
- Five procedural factorization cases with AYUDA INICIAL.
- Student results remain encrypted locally with AES-256-GCM and protected by the teacher PIN.
'@ | Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8

$keep = @($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
if ((Get-ChildItem $dist -File).Count -ne 5) { throw "V60.4 Teacher Edition installer package contains unexpected files." }
