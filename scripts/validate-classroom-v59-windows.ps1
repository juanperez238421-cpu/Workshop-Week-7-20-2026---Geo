$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/classroom-v59-windows"
$installerName = "Geometry-Tactical-Classroom-V59-Setup-59.0.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer) { throw "Classroom V59 Windows installer was not found." }
if ($installer.Length -lt 70000000) { throw "Classroom V59 installer is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($installer.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "The installer does not have a Windows PE header." }

$installDir = Join-Path $env:RUNNER_TEMP "GeometryTacticalClassroomV59"
$ready = Join-Path $env:RUNNER_TEMP "v59-classroom-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "v59-classroom-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "v59-classroom-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "v59-classroom-stderr.log"
$errorFile = "classroom-v59-validation-error.log"
$process = $null

trap {
  $details = @(
    "Classroom V59 installed-runtime validation failed.",
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

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue

$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Silent installer returned exit code $($installProcess.ExitCode)." }
if (-not (Test-Path $installDir)) { throw "The installer did not create the requested local installation directory." }

$installedExe = Get-ChildItem $installDir -Filter "*.exe" -File -Recurse |
  Where-Object { $_.Name -notmatch "(?i)uninstall" } |
  Sort-Object Length -Descending |
  Select-Object -First 1
if (-not $installedExe) { throw "The installed Geometry Tactical V59 executable was not found." }
if ($installedExe.Length -lt 100000000) { throw "The installed application payload is unexpectedly small." }

$installedStream = [System.IO.File]::OpenRead($installedExe.FullName)
try { $installedFirst = $installedStream.ReadByte(); $installedSecond = $installedStream.ReadByte() } finally { $installedStream.Dispose() }
if ($installedFirst -ne 0x4D -or $installedSecond -ne 0x5A) { throw "The installed application does not have a Windows PE header." }

$env:V59_READY_FILE = $ready
$env:V59_SELF_TEST_FILE = $vaultFile
$env:V59_TEACHER_PIN = "9109"
$env:V59_ALLOW_SECOND_INSTANCE = "true"
$env:ELECTRON_ENABLE_LOGGING = "1"

$process = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Classroom V59 installed PID=$($process.Id) PATH=$($installedExe.FullName) SIZE=$($installedExe.Length)" | Tee-Object classroom-v59-startup.log

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
  throw "Installed V59 did not produce a renderer-bootstrap readiness report. STDOUT=$stdout STDERR=$stderr"
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

$uninstaller = Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse | Select-Object -First 1
if ($uninstaller) {
  $uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList @("/S") -Wait -PassThru
  if ($uninstallProcess.ExitCode -ne 0) { throw "Silent uninstaller returned exit code $($uninstallProcess.ExitCode)." }
}

$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $installerName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Classroom V59 installer validated: $installerName · $($installer.Length) bytes · SHA256 $hash" | Tee-Object classroom-v59-installer.log

@'
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Geometry-Tactical-Classroom-V59-Setup-59.0.0-Local-x64.exe"
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
GEOMETRY TACTICAL CLASSROOM V59 · FULL LOCAL WINDOWS INSTALLER

Recommended installation:
1. Extract this ZIP completely.
2. Run INSTALL_VERIFIED.cmd.
3. The script verifies SHA-256 and then opens the standard Windows installer.
4. Choose the installation folder and finish the wizard.
5. A desktop shortcut and Start Menu shortcut are created.

The uninstaller is available in Windows Settings > Apps and inside the installation folder.
Uninstalling the application does not delete the encrypted classroom-result vault.

Registration:
- Enter three different full names. Spaces are supported.
- Select eighth-grade group 8°A, 8°B or 8°C.

Controls:
- Student 1: WASD movement.
- Student 2: mouse aim.
- Student 3: Space/F fire; Q melee; R reload; E pick up or throw; Shift dash.
- After E throws a weapon, it leaves the player's hand. Fight unarmed or recover a weapon.

Assessment:
- Every generated figure is a right triangle with a visible 90-degree marker.
- Values, orientations and missing sides vary procedurally.
- Recent-question memory reduces repeated questions and answer-position patterns.
- Mission time: 20 real minutes. Question time: 60 seconds.

Protected records:
- Names, selected answers, correct answers and scores are encrypted locally with AES-256-GCM.
- Teacher Results PIN: 9109.
- No plaintext JSON or CSV student report is created.
- The application is offline and contains no analytics, telemetry, updater or external navigation.

This build is not commercially code-signed, so Windows may display Unknown publisher.
'@ | Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8

$keep = @($installerName, "SHA256SUMS.txt", "VERIFY_INSTALLER.ps1", "INSTALL_VERIFIED.cmd", "README_INSTALLER.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
$remaining = Get-ChildItem $dist -File
if ($remaining.Count -ne 5) { throw "Classroom V59 installer package contains unexpected files." }
if (($remaining | Measure-Object Length -Sum).Sum -gt 135000000) { throw "Classroom V59 installer package is unexpectedly large." }
