$ErrorActionPreference = "Stop"

$dist = Resolve-Path "dist/classroom-v61-windows"
$installerName = "Geometry-Tactical-Classroom-V61-Setup-61.0.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer) { throw "Classroom V61 Windows installer was not found." }
if ($installer.Length -lt 70000000) { throw "Classroom V61 installer is unexpectedly small." }

$stream = [System.IO.File]::OpenRead($installer.FullName)
try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
if ($first -ne 0x4D -or $second -ne 0x5A) { throw "The installer does not have a Windows PE header." }

$installDir = Join-Path $env:RUNNER_TEMP "GeometryTacticalClassroomV61"
$ready = Join-Path $env:RUNNER_TEMP "v61-classroom-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "v61-classroom-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "v61-classroom-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "v61-classroom-stderr.log"
$errorFile = "classroom-v61-validation-error.log"

trap {
  $details = @("Classroom V61 installed-runtime validation failed.", "Exception: $($_.Exception.Message)", "Position: $($_.InvocationInfo.PositionMessage)") -join "`r`n"
  $details | Set-Content $errorFile -Encoding UTF8
  foreach ($pair in @(@($ready,"classroom-v61-ready-last.json"),@($vaultFile,"classroom-v61-vault-last.json"),@($stdoutFile,"classroom-v61-stdout.log"),@($stderrFile,"classroom-v61-stderr.log"))) {
    if (Test-Path $pair[0]) { Copy-Item $pair[0] $pair[1] -Force }
  }
  Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Geometry Tactical Classroom V61*" -or $_.ProcessName -like "Geometry-Tactical-Classroom-V61*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Error $details
  exit 1
}

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installProcess.ExitCode -ne 0) { throw "Silent installer returned exit code $($installProcess.ExitCode)." }

$installedExe = Get-ChildItem $installDir -Filter "*.exe" -File -Recurse | Where-Object { $_.Name -notmatch "(?i)uninstall" } | Sort-Object Length -Descending | Select-Object -First 1
if (-not $installedExe) { throw "The installed Geometry Tactical V61 executable was not found." }
if ($installedExe.Length -lt 100000000) { throw "The installed application payload is unexpectedly small." }

$env:V61_READY_FILE = $ready
$env:V61_SELF_TEST_FILE = $vaultFile
$env:V61_TEACHER_PIN = "9109"
$env:V61_ALLOW_SECOND_INSTANCE = "true"
$env:ELECTRON_ENABLE_LOGGING = "1"
$process = Start-Process $installedExe.FullName -WorkingDirectory $installedExe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
"Classroom V61 installed PID=$($process.Id) PATH=$($installedExe.FullName) SIZE=$($installedExe.Length)" | Tee-Object classroom-v61-startup.log

$report = $null
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep 1
  if (Test-Path $ready) {
    try { $candidate = Get-Content $ready -Raw | ConvertFrom-Json; if ($candidate.renderer.phase -eq "renderer-bootstrap") { $report = $candidate; break } } catch {}
  }
}
if (-not $report) { throw "Installed V61 did not produce a renderer-bootstrap readiness report." }
if ($report.version -ne "61.0.0" -or $report.edition -ne "classroom-triangle-line-separation-v61") { throw "Classroom V61 identity is incorrect." }
if ($report.renderer.fixedSimulationHz -ne 120 -or $report.renderer.levels -ne 5) { throw "Core engine contract failed." }
if ($report.renderer.fixedMatchSeconds -ne 1800) { throw "The mission is not configured for 30 minutes." }
if ($report.renderer.pauseAllowed -ne $true -or $report.renderer.maximumPauses -ne 3 -or $report.renderer.pauseSeconds -ne 30) { throw "The controlled pause policy is incorrect." }
if ($report.renderer.missionClockFreezesDuringPause -ne $true) { throw "The mission clock does not freeze during pause." }
if ($report.renderer.thalesCollisionFreeLabels -ne $true -or $report.renderer.thalesVertexLabels -ne $true) { throw "Thales label contracts were not reported." }
if ($report.renderer.thalesOutwardLeaderRouting -ne $true -or $report.renderer.thalesLeaderUnderpaint -ne $true) { throw "Thales leader separation contracts failed." }
if ($report.renderer.thalesCoincidentSideHighlight -ne $true -or $report.renderer.thalesParallelSegmentHalo -ne $true -or $report.renderer.thalesLineSeparationVersion -ne 61) { throw "Thales triangle-line separation contracts failed." }
if ($report.renderer.thrownWeaponLeavesHand -ne $true -or $report.renderer.unarmedMeleeAttack -ne $true) { throw "Combat contracts regressed." }
if ($report.renderer.eighthGradeGroupRequired -ne $true -or $report.renderer.editableLoginSpacebar -ne $true) { throw "Registration contracts regressed." }
if ($report.renderer.proceduralQuestionBank -ne $true -or $report.renderer.repeatedQuestionGuard -ne $true -or $report.renderer.rightTriangleCaseCount -lt 144) { throw "Question-bank contract failed." }
if ($report.renderer.protectedResultsVault -ne $true -or $report.renderer.passwordGate -ne $true -or $report.renderer.answerRevealDisabled -ne $true) { throw "Protected assessment contract failed." }

for ($i = 0; $i -lt 45 -and -not (Test-Path $vaultFile); $i++) { Start-Sleep 1 }
if (-not (Test-Path $vaultFile)) { throw "Encrypted vault self-test was not created." }
$vault = Get-Content $vaultFile -Raw | ConvertFrom-Json
if ($vault.ok -ne $true -or $vault.encryptedSave -ne $true -or $vault.wrongPinRejected -ne $true -or $vault.correctPinUnlocked -ne $true) { throw "Encrypted vault security checks failed." }
if ($vault.questionRecorded -ne $true -or $vault.scoreRecorded -ne $true -or $vault.groupRecorded -ne $true -or $vault.consolidatedStudentRows -ne 3 -or $vault.pausePolicyRecorded -ne $true) { throw "Protected classroom data checks failed." }

Get-Content $ready | Tee-Object classroom-v61-startup.log -Append
Get-Content $vaultFile | Tee-Object classroom-v61-startup.log -Append
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Geometry Tactical Classroom V61*" -or $_.ProcessName -like "Geometry-Tactical-Classroom-V61*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 3
$uninstaller = Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse | Select-Object -First 1
if ($uninstaller) { $uninstallProcess = Start-Process $uninstaller.FullName -ArgumentList @("/S") -Wait -PassThru; if ($uninstallProcess.ExitCode -ne 0) { throw "Silent uninstaller failed." } }

$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $installerName" | Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii
"Classroom V61 installer validated: $installerName · $($installer.Length) bytes · SHA256 $hash" | Tee-Object classroom-v61-installer.log

@'
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fileName = "Geometry-Tactical-Classroom-V61-Setup-61.0.0-Local-x64.exe"
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
GEOMETRY TACTICAL CLASSROOM V61 · FULL LOCAL WINDOWS INSTALLER

Extract the ZIP and run INSTALL_VERIFIED.cmd.

V61 figure corrections:
- Thales segment labels are collision-checked across all four mirrored orientations.
- AD and AE are highlighted as coincident sides without erasing the full outer triangle.
- DE has a white separator halo and independent blue stroke.
- Label leaders route outward and are painted below the geometry.
- D and E labels are moved away from the line junctions and 90-degree marker.

Preserved classroom policy:
- 30-minute mission.
- Maximum 3 pauses, each up to 30 seconds.
- P or Esc pauses outside geometry checkpoints; the team may resume early.
- Mission clock and tactical simulation freeze during the actual pause.

Names, group, answers, score and pause use are encrypted locally with AES-256-GCM. Teacher Results PIN: 9109. Existing encrypted V60 and V59 records can be migrated. No plaintext student report is created.
'@ | Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8

$keep = @($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt")
Get-ChildItem $dist -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
if ((Get-ChildItem $dist -File).Count -ne 5) { throw "Classroom V61 installer package contains unexpected files." }
