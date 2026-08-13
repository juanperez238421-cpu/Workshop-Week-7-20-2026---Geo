$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/math-factorization-v60-windows"
$installerName = "Math-Tactical-Classroom-V60-Factorization-Setup-60.2.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer) { throw "Math Tactical V60.2 Windows installer was not found." }
if ($installer.Length -lt 70000000) { throw "Math Tactical installer is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($installer.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "The installer does not have a Windows PE header." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV60Factorization"
$ready = Join-Path $env:RUNNER_TEMP "math-v60-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v60-boss-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v60-question-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v60-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v60-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v60-stderr.log"
$errorFile = "math-v60-validation-error.log"

function Stop-MathApp {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "Math Tactical Classroom V60*" -or
    $_.ProcessName -like "Math-Tactical-Classroom-V60*"
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
  $details = @("Math Tactical V60.2 installed-runtime validation failed.", "Exception: $($_.Exception.Message)", "Position: $($_.InvocationInfo.PositionMessage)") -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(@($ready,"math-v60-ready-last.json"),@($bossReady,"math-v60-boss-last.json"),@($questionReady,"math-v60-question-last.json"),@($vaultFile,"math-v60-vault-last.json"),@($stdoutFile,"math-v60-stdout.log"),@($stderrFile,"math-v60-stderr.log"))) {
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
if (-not $installedExe) { throw "Installed Math Tactical executable was not found." }
if ($installedExe.Length -lt 100000000) { throw "The installed application payload is unexpectedly small." }

$env:V60_READY_FILE = $ready
$env:V60_SELF_TEST_FILE = $vaultFile
$env:MATH_V60_TEACHER_PIN = "9109"
$env:V60_TEACHER_PIN = "9109"
$env:V60_ALLOW_SECOND_INSTANCE = "true"
$env:V60_BOSS_PROBE = "false"
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$env:ELECTRON_ENABLE_LOGGING = "1"
$process = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Math Tactical V60.2 installed PID=$($process.Id) PATH=$($installedExe.FullName) SIZE=$($installedExe.Length)" | Tee-Object math-v60-startup.log

$report = Wait-Ready $ready "renderer-bootstrap" 120
if ($report.version -ne "60.2.0" -or $report.edition -ne "math-factorization-workshop-v60") { throw "Math Tactical V60.2 identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Core five-room engine contract failed." }
if ($report.renderer.fixedMatchSeconds -ne 1800) { throw "Mission duration is not 30 minutes." }
if ($report.renderer.pauseAllowed -ne $true -or $report.renderer.maximumPauses -ne 3 -or $report.renderer.pauseSeconds -ne 30) { throw "Controlled pause policy is incorrect." }
if ($report.renderer.factorizationCaseCount -ne 5 -or $report.renderer.fiveFactorizationCases -ne $true -or $report.renderer.factorizationFiveCasesOnly -ne $true) { throw "Five-case factorization contract failed." }
$topics = @($report.renderer.questionTopics)
foreach ($type in @("common-factor","grouping","difference-squares","perfect-square-trinomial","general-trinomial")) {
  if ($topics -notcontains $type) { throw "Missing runtime factorization type: $type" }
}
if ($report.renderer.proceduralQuestionBank -ne $true -or $report.renderer.repeatedQuestionGuard -ne $true) { throw "Procedural no-repeat question contract failed." }
if ($report.renderer.room5FinalBoss -ne $true -or $report.renderer.bossRequiresThrownRoomWeapon -ne $true) { throw "Final boss readiness contract failed." }
if ($report.renderer.protectedResultsVault -ne $true -or $report.renderer.passwordGate -ne $true -or $report.renderer.answerRevealDisabled -ne $true) { throw "Protected assessment contract failed." }

for ($i = 0; $i -lt 45 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
if ($vault.questionRecorded -ne $true -or $vault.scoreRecorded -ne $true -or $vault.groupRecorded -ne $true -or $vault.consolidatedStudentRows -ne 3 -or $vault.pausePolicyRecorded -ne $true) { throw "Protected classroom data checks failed." }
Stop-MathApp

Remove-Item $bossReady -Force -ErrorAction SilentlyContinue
$env:V60_READY_FILE = $bossReady
$env:V60_BOSS_PROBE = "true"
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
$bossProcess = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
$boss = Wait-Ready $bossReady "room5-boss-probe" 120
if ($boss.renderer.bossPresent -ne $true) { throw "Room 5 final boss was not instantiated in the installed application." }
if ($boss.renderer.bossHealthPhases -ne 3) { throw "Final boss does not have the expected three phases." }
if ($boss.renderer.bossShieldActive -ne $true) { throw "Final boss shield was not active at spawn." }
if ($boss.renderer.roomWeaponCount -lt 1 -or $boss.renderer.bossRequiresThrownRoomWeapon -ne $true) { throw "Final boss room-weapon shield mechanic failed." }
Stop-MathApp

Remove-Item $questionReady -Force -ErrorAction SilentlyContinue
$env:V60_READY_FILE = $questionReady
$env:V60_BOSS_PROBE = "false"
$env:V60_QUESTION_PREVIEW = "general-trinomial"
$questionProcess = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
$question = Wait-Ready $questionReady "question-layout-preview" 120
if ($question.renderer.questionType -ne "general-trinomial") { throw "Installed factorization preview did not produce the requested general-trinomial case." }
if ($question.renderer.fiveFactorizationCases -ne $true -or $question.renderer.algebraicFactorizationCanvas -ne $true) { throw "Factorization preview contract failed." }
if ($question.renderer.questionLayoutFitsViewport -ne $true) { throw "Factorization question layout does not fit the installed viewport." }
Stop-MathApp

Get-Content $ready | Tee-Object math-v60-startup.log -Append
Get-Content $bossReady | Tee-Object math-v60-startup.log -Append
Get-Content $questionReady | Tee-Object math-v60-startup.log -Append
Get-Content $vaultFile | Tee-Object math-v60-startup.log -Append

$uninstaller = Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse | Select-Object -First 1
if ($uninstaller) {
  $uninstallProcess = Start-Process $uninstaller.FullName -ArgumentList @("/S") -Wait -PassThru
  if ($uninstallProcess.ExitCode -ne 0) { throw "Silent uninstaller failed." }
}

$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $installerName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Math Tactical V60.2 installer validated: $installerName · $($installer.Length) bytes · SHA256 $hash" | Tee-Object math-v60-installer.log

@'
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Math-Tactical-Classroom-V60-Factorization-Setup-60.2.0-Local-x64.exe"
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
MATH TACTICAL CLASSROOM V60.2 · FACTORIZATION WORKSHOP

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Gameplay:
- Five complete tactical rooms.
- Normal enemies use the fast 1–2 hit durability tuning and no normal defensive shield.
- Room 5 preserves the three-phase ARCHIVE WARDEN final boss.
- The boss shield still requires a room weapon thrown with E before the core can be damaged.
- 30-minute mission with up to three 30-second pauses.

Assessment checkpoints use five procedural factorization cases:
1. Factor común.
2. Agrupación.
3. Diferencia de cuadrados.
4. Trinomio cuadrado perfecto.
5. Trinomio general.

Recent-question memory prevents fixed repetition. Student names, group, answers, score and pause use are encrypted locally with AES-256-GCM in a Math Tactical vault separate from Geometry Tactical. Teacher Results PIN: 9109. No plaintext student report is created.
'@ | Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8

$keep = @($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
if ((Get-ChildItem $dist -File).Count -ne 5) { throw "Math Tactical installer package contains unexpected files." }
