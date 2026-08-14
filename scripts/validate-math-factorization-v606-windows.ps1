$ErrorActionPreference = "Stop"
$dist = Resolve-Path "dist/math-factorization-v60-fair-dodge-windows"
$installerName = "Math-Tactical-Classroom-V60.6-Fair-Dodge-Boss-Setup-60.6.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer -or $installer.Length -lt 70000000) { throw "V60.6 installer missing or unexpectedly small." }
$stream = [IO.File]::OpenRead($installer.FullName); try { $a=$stream.ReadByte(); $b=$stream.ReadByte() } finally { $stream.Dispose() }
if ($a -ne 0x4D -or $b -ne 0x5A) { throw "Installer is not a Windows PE file." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV606FairDodge"
$ready = Join-Path $env:RUNNER_TEMP "math-v606-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v606-boss-ready.json"
$teacherReady = Join-Path $env:RUNNER_TEMP "math-v606-teacher-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v606-question-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v606-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v606-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v606-stderr.log"
$errorFile = "math-v606-validation-error.log"
function Stop-App { Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Math Tactical Classroom V60.6*" -or $_.ProcessName -like "Math-Tactical-Classroom-V60.6*" } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }
function Wait-Ready([string]$File,[string]$Phase,[int]$Seconds=120) { for($i=0;$i-lt$Seconds;$i++){ Start-Sleep 1; if(Test-Path $File){ try{$x=Get-Content $File -Raw|ConvertFrom-Json; if($x.renderer.phase -eq $Phase){return $x}}catch{} } }; throw "Timed out waiting for $Phase" }
function Launch([string]$File){ $env:V60_READY_FILE=$File; Start-Process $script:exe.FullName -WorkingDirectory $script:exe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru }
trap { ("V60.6 runtime validation failed.`r`n"+$_.Exception.Message)|Set-Content $errorFile; foreach($p in @(@($ready,"math-v606-ready-last.json"),@($bossReady,"math-v606-boss-last.json"),@($teacherReady,"math-v606-teacher-last.json"),@($questionReady,"math-v606-question-last.json"),@($vaultFile,"math-v606-vault-last.json"),@($stdoutFile,"math-v606-stdout.log"),@($stderrFile,"math-v606-stderr.log"))){if(Test-Path $p[0]){Copy-Item $p[0] $p[1]-Force}}; Stop-App; exit 1 }

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$bossReady,$teacherReady,$questionReady,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$p=Start-Process $installer.FullName -ArgumentList @("/S","/D=$installDir") -Wait -PassThru; if($p.ExitCode-ne0){throw "Silent install failed."}
$script:exe=Get-ChildItem $installDir -Filter "*.exe" -File -Recurse|Where-Object{$_.Name-notmatch"(?i)uninstall"}|Sort-Object Length -Descending|Select-Object -First 1
if(-not $script:exe -or $script:exe.Length-lt100000000){throw "Installed app payload invalid."}
$env:V60_SELF_TEST_FILE=$vaultFile; $env:MATH_V60_TEACHER_PIN="9109"; $env:V60_TEACHER_PIN="9109"; $env:V60_ALLOW_SECOND_INSTANCE="true"; $env:ELECTRON_ENABLE_LOGGING="1"; $env:V60_BOSS_PROBE="false"
Remove-Item Env:V60_TEACHER_PROBE,Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $ready|Out-Null; $r=Wait-Ready $ready "renderer-bootstrap"
if($r.version-ne"60.6.0" -or $r.edition-ne"math-factorization-fair-dodge-boss-v606"){throw "Wrong V60.6 identity."}
if($r.renderer.fixedMatchSeconds-ne2700 -or $r.renderer.questionSeconds-ne90 -or $r.renderer.levels-ne5){throw "Core timing/room contract failed."}
if($r.renderer.teacherModeAvailable-ne$true -or $r.renderer.factorizationCaseCount-ne5 -or $r.renderer.factorizationInitialStepHelp-ne$true){throw "Teacher/factorization contract failed."}
if($r.renderer.bossVisibleAimTelegraph-ne$true -or $r.renderer.bossAimLocksBeforeDash-ne$true -or $r.renderer.bossCommittedDashNoHoming-ne$true -or $r.renderer.bossPerfectDodgeDamagesShield-ne$true){throw "Fair-dodge readiness markers failed."}
if(@($r.renderer.bossDashChainsByPhase)-join"," -ne "3,5,7"){throw "Dash chain escalation failed."}
if(@($r.renderer.bossDashSpeedsByPhase)-join"," -ne "740,900,1040"){throw "Fair dash speeds failed."}
if(@($r.renderer.bossDashSteeringByPhase)-join"," -ne "0,0,0"){throw "Dash must not home after lock."}
if([math]::Abs([double]$r.renderer.bossDodgeIFramesSeconds-0.30)-gt0.001 -or [math]::Abs([double]$r.renderer.bossDodgeCooldownSeconds-0.42)-gt0.001){throw "Dodge timing failed."}
for($i=0;$i-lt45-and-not(Test-Path $vaultFile);$i++){Start-Sleep 1}; $v=Get-Content $vaultFile -Raw|ConvertFrom-Json; if($v.ok-ne$true -or $v.encryptedSave-ne$true -or $v.wrongPinRejected-ne$true -or $v.correctPinUnlocked-ne$true){throw "Vault checks failed."}; Stop-App

$env:V60_BOSS_PROBE="true"; Remove-Item Env:V60_TEACHER_PROBE,Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $bossReady|Out-Null; $b=Wait-Ready $bossReady "room5-boss-probe"
if($b.renderer.bossPresent-ne$true -or $b.renderer.bossHealthPhases-ne3 -or $b.renderer.bossRoomDeploymentGraceSeconds-ne0 -or $b.renderer.bossOpeningDashActive-ne$true){throw "Boss did not start correctly."}
if($b.renderer.bossVisibleAimTelegraph-ne$true -or $b.renderer.bossAimLocksBeforeDash-ne$true -or $b.renderer.bossCommittedDashNoHoming-ne$true -or $b.renderer.bossPerfectDodgeDamagesShield-ne$true){throw "Installed fair-dodge boss probe failed."}
if(@($b.renderer.bossDashTelegraphSecondsByPhase)-join"," -ne "0.76,0.62,0.5"){throw "Installed telegraph timings failed."}
if(@($b.renderer.bossDashLockSecondsByPhase)-join"," -ne "0.24,0.2,0.17"){throw "Installed lock windows failed."}
if($b.renderer.bossShieldHitBased-ne$true -or $b.renderer.bossRequiresThrownRoomWeapon-ne$false -or $b.renderer.roomWeaponPickupFunctional-ne$true){throw "Boss shield/floor weapon contract failed."}; Stop-App

$env:V60_BOSS_PROBE="false"; $env:V60_TEACHER_PROBE="5"; Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $teacherReady|Out-Null; $t=Wait-Ready $teacherReady "teacher-room-probe"; if($t.renderer.teacherMode-ne$true -or $t.renderer.currentRoom-ne5 -or $t.renderer.teacherSessionsExcludedFromGrades-ne$true){throw "Teacher Room 5 access failed."}; Stop-App
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue; $env:V60_QUESTION_PREVIEW="general-trinomial"
Launch $questionReady|Out-Null; $q=Wait-Ready $questionReady "question-layout-preview"; if($q.renderer.questionSeconds-ne90 -or $q.renderer.factorizationInitialStepHelp-ne$true -or $q.renderer.questionLayoutFitsViewport-ne$true){throw "Question runtime failed."}; Stop-App

Get-Content $ready,$bossReady,$teacherReady,$questionReady,$vaultFile|Tee-Object math-v606-startup.log -Append|Out-Null
$un=Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse|Select-Object -First 1; if($un){$u=Start-Process $un.FullName -ArgumentList "/S" -Wait -PassThru; if($u.ExitCode-ne0){throw "Uninstall failed."}}
$hash=(Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower(); "$hash  $installerName"|Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii; "V60.6 validated $hash"|Tee-Object math-v606-installer.log
@'
param([switch]$Install)
$ErrorActionPreference="Stop";$root=Split-Path -Parent $MyInvocation.MyCommand.Path;$name="Math-Tactical-Classroom-V60.6-Fair-Dodge-Boss-Setup-60.6.0-Local-x64.exe";$target=Join-Path $root $name;$expected=((Get-Content (Join-Path $root "SHA256SUMS.txt")|Select-Object -First 1)-split"\s+")[0].ToLower();$actual=(Get-FileHash $target -Algorithm SHA256).Hash.ToLower();if($actual-ne$expected){throw"CHECKSUM FAILED"};Write-Host "SHA-256 verified" -ForegroundColor Green;if($Install){Start-Process $target}
'@|Set-Content "$dist/VERIFY_INSTALLER.ps1" -Encoding UTF8
'@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_INSTALLER.ps1" -Install
if errorlevel 1 (pause & exit /b 1)'|Set-Content "$dist/INSTALL_VERIFIED.cmd" -Encoding ASCII
@'
MATH TACTICAL CLASSROOM V60.6 · FAIR DODGE BOSS EDITION

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Boss fight:
- Room 5 still begins immediately, but the opening dash has a readable telegraph.
- Amber lane = the Warden is still predicting and tracking your movement.
- Red lane + DODGE NOW = aim is locked. The Warden cannot home after this point.
- Tap Shift + movement during the red lock window. Do not hold Shift.
- Boss-room dodge: 0.30 s invulnerability, 0.42 s cooldown.
- A perfect close dodge makes the Warden overextend and removes one shield hit.
- Phase 1 / 2 / 3 keep 3 / 5 / 7 dash chains, with fair speeds 740 / 900 / 1040 and longer readable telegraphs.
- Projectile pressure occurs only after a dash, with a center escape lane; it no longer overlaps the launch telegraph.
- Survive the chain, use the fatigue window, break the shield, then hit the open core.

Preserved: 45-minute mission, 90-second questions with AYUDA INICIAL, Teacher Mode Rooms 1–5 + F8, permanent boss-room floor weapons, fast normal enemies, encrypted results.
'@|Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8
$keep=@($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt");Get-ChildItem $dist -Force|Where-Object{$keep-notcontains$_.Name}|Remove-Item -Recurse -Force;if((Get-ChildItem $dist -File).Count-ne5){throw"Unexpected package files."}
