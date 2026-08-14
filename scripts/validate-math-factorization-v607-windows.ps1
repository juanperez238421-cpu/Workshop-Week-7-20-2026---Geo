$ErrorActionPreference = "Stop"
$dist = Resolve-Path "dist/math-factorization-v60-mastery-windows"
$installerName = "Math-Tactical-Classroom-V60.7-Mastery-Boss-Setup-60.7.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer -or $installer.Length -lt 70000000) { throw "V60.7 installer missing or unexpectedly small." }
$stream = [IO.File]::OpenRead($installer.FullName); try { $a=$stream.ReadByte(); $b=$stream.ReadByte() } finally { $stream.Dispose() }
if ($a -ne 0x4D -or $b -ne 0x5A) { throw "Installer is not a Windows PE file." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV607Mastery"
$ready = Join-Path $env:RUNNER_TEMP "math-v607-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v607-boss-ready.json"
$teacherReady = Join-Path $env:RUNNER_TEMP "math-v607-teacher-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v607-question-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v607-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v607-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v607-stderr.log"
$errorFile = "math-v607-validation-error.log"
function Stop-App { Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Math Tactical Classroom V60.7*" -or $_.ProcessName -like "Math-Tactical-Classroom-V60.7*" } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }
function Wait-Ready([string]$File,[string]$Phase,[int]$Seconds=120) { for($i=0;$i-lt$Seconds;$i++){ Start-Sleep 1; if(Test-Path $File){ try{$x=Get-Content $File -Raw|ConvertFrom-Json; if($x.renderer.phase -eq $Phase){return $x}}catch{} } }; throw "Timed out waiting for $Phase" }
function Launch([string]$File){ $env:V60_READY_FILE=$File; Start-Process $script:exe.FullName -WorkingDirectory $script:exe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru }
trap { ("V60.7 runtime validation failed.`r`n"+$_.Exception.Message)|Set-Content $errorFile; foreach($p in @(@($ready,"math-v607-ready-last.json"),@($bossReady,"math-v607-boss-last.json"),@($teacherReady,"math-v607-teacher-last.json"),@($questionReady,"math-v607-question-last.json"),@($vaultFile,"math-v607-vault-last.json"),@($stdoutFile,"math-v607-stdout.log"),@($stderrFile,"math-v607-stderr.log"))){if(Test-Path $p[0]){Copy-Item $p[0] $p[1]-Force}}; Stop-App; Write-Error $_; exit 1 }

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$bossReady,$teacherReady,$questionReady,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$p=Start-Process $installer.FullName -ArgumentList @("/S","/D=$installDir") -Wait -PassThru; if($p.ExitCode-ne0){throw "Silent install failed."}
$script:exe=Get-ChildItem $installDir -Filter "*.exe" -File -Recurse|Where-Object{$_.Name-notmatch"(?i)uninstall"}|Sort-Object Length -Descending|Select-Object -First 1
if(-not $script:exe -or $script:exe.Length-lt100000000){throw "Installed app payload invalid."}
$env:V60_SELF_TEST_FILE=$vaultFile; $env:MATH_V60_TEACHER_PIN="9109"; $env:V60_TEACHER_PIN="9109"; $env:V60_ALLOW_SECOND_INSTANCE="true"; $env:ELECTRON_ENABLE_LOGGING="1"; $env:V60_BOSS_PROBE="false"
Remove-Item Env:V60_TEACHER_PROBE,Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue

Launch $ready|Out-Null; $r=Wait-Ready $ready "renderer-bootstrap"
if($r.version-ne"60.7.0" -or $r.edition-ne"math-factorization-mastery-boss-v607"){throw "Wrong V60.7 identity."}
if($r.renderer.fixedMatchSeconds-ne2700 -or $r.renderer.questionSeconds-ne90 -or $r.renderer.levels-ne5){throw "Core timing/room contract failed."}
if($r.renderer.teacherModeAvailable-ne$true -or $r.renderer.teacherRoomCount-ne5 -or $r.renderer.factorizationCaseCount-ne5 -or $r.renderer.factorizationInitialStepHelp-ne$true){throw "Teacher/factorization contract failed."}
if($r.renderer.bossVisibleAimTelegraph-ne$true -or $r.renderer.bossAimLocksBeforeDash-ne$true -or $r.renderer.bossCommittedDashNoHoming-ne$true){throw "Readable committed-dash contract failed."}
if($r.renderer.bossVariableDashCadence-ne$true -or $r.renderer.bossCoreMultiHitArmor-ne$true -or $r.renderer.bossPerfectDodgeBuildsCounterFocus-ne$true -or $r.renderer.bossPerfectDodgeDamagesShield-ne$false){throw "Mastery boss behavior flags failed."}
if($r.renderer.bossMasteryTargetDeaths-ne30 -or $r.renderer.bossMasteryAssistAfterDeaths-ne$true){throw "30-death mastery target / bounded assist marker failed."}
if(@($r.renderer.bossDashChainsByPhase)-join"," -ne "4,6,8"){throw "Dash chain escalation failed."}
if(@($r.renderer.bossDashSpeedsByPhase)-join"," -ne "820,990,1160"){throw "Dash speed escalation failed."}
if(@($r.renderer.bossCoreHitsRequiredByPhase)-join"," -ne "3,4,5"){throw "Core armor escalation failed."}
if([math]::Abs([double]$r.renderer.bossDodgeIFramesSeconds-0.18)-gt0.001 -or [math]::Abs([double]$r.renderer.bossDodgeCooldownSeconds-0.38)-gt0.001){throw "Mastery dodge timing failed."}
if([math]::Abs([double]$r.renderer.bossFinalDodgeCueSeconds-0.12)-gt0.001){throw "Final dodge cue timing failed."}
for($i=0;$i-lt45-and-not(Test-Path $vaultFile);$i++){Start-Sleep 1}; if(-not(Test-Path $vaultFile)){throw "Vault self-test missing."}; $v=Get-Content $vaultFile -Raw|ConvertFrom-Json; if($v.ok-ne$true -or $v.encryptedSave-ne$true -or $v.wrongPinRejected-ne$true -or $v.correctPinUnlocked-ne$true){throw "Vault checks failed."}; Stop-App

$env:V60_BOSS_PROBE="true"; Remove-Item Env:V60_TEACHER_PROBE,Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $bossReady|Out-Null; $b=Wait-Ready $bossReady "room5-boss-probe"
if($b.renderer.bossPresent-ne$true -or $b.renderer.bossHealthPhases-ne3 -or $b.renderer.bossRoomDeploymentGraceSeconds-ne0 -or $b.renderer.bossOpeningDashActive-ne$true){throw "Boss did not start correctly."}
if($b.renderer.bossShieldHitBased-ne$true -or $b.renderer.bossRequiresThrownRoomWeapon-ne$false){throw "Killable hit-based shield contract failed."}
if($b.renderer.bossShieldMaxHitPoints-ne6 -or $b.renderer.bossShieldOneHitReduces-ne$true){throw "Phase-one 6-hit shield probe failed."}
if($b.renderer.bossPerfectDodgeBuildsCounterFocus-ne$true -or $b.renderer.bossPerfectDodgeDamagesShield-ne$false){throw "Perfect dodge must reward timing without free shield damage."}
if($b.renderer.bossCoreOneHitDoesNotAdvancePhase-ne$true -or @($b.renderer.bossCoreHitsRequiredByPhase)-join"," -ne "3,4,5"){throw "Multi-hit core execution probe failed."}
if($b.renderer.bossVariableDashCadence-ne$true -or $b.renderer.bossMasteryTargetDeaths-ne30 -or $b.renderer.bossMasteryAssistAfterDeaths-ne$true){throw "Mastery director probe failed."}
if(@($b.renderer.bossDashChainsByPhase)-join"," -ne "4,6,8" -or @($b.renderer.bossDashSpeedsByPhase)-join"," -ne "820,990,1160"){throw "Installed mastery escalation failed."}
if(@($b.renderer.bossDashSteeringByPhase)-join"," -ne "0,0,0"){throw "Dashes must remain committed after lock."}
if($b.renderer.roomWeaponPickupFunctional-ne$true -or $b.renderer.roomWeaponCount-lt6 -or $b.renderer.roomWeaponsPersistent-ne$true){throw "Boss-room floor weapons regressed."}; Stop-App

$env:V60_BOSS_PROBE="false"; $env:V60_TEACHER_PROBE="5"; Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $teacherReady|Out-Null; $t=Wait-Ready $teacherReady "teacher-room-probe"; if($t.renderer.teacherMode-ne$true -or $t.renderer.currentRoom-ne5 -or $t.renderer.teacherSessionsExcludedFromGrades-ne$true){throw "Teacher Room 5 access failed."}; Stop-App
Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue; $env:V60_QUESTION_PREVIEW="general-trinomial"
Launch $questionReady|Out-Null; $q=Wait-Ready $questionReady "question-layout-preview"; if($q.renderer.questionSeconds-ne90 -or $q.renderer.factorizationInitialStepHelp-ne$true -or $q.renderer.questionLayoutFitsViewport-ne$true){throw "Question runtime failed."}; Stop-App

Get-Content $ready,$bossReady,$teacherReady,$questionReady,$vaultFile|Tee-Object math-v607-startup.log -Append|Out-Null
$un=Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse|Select-Object -First 1; if($un){$u=Start-Process $un.FullName -ArgumentList "/S" -Wait -PassThru; if($u.ExitCode-ne0){throw "Uninstall failed."}}
$hash=(Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower(); "$hash  $installerName"|Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii; "V60.7 validated $hash"|Tee-Object math-v607-installer.log
@'
param([switch]$Install)
$ErrorActionPreference="Stop";$root=Split-Path -Parent $MyInvocation.MyCommand.Path;$name="Math-Tactical-Classroom-V60.7-Mastery-Boss-Setup-60.7.0-Local-x64.exe";$target=Join-Path $root $name;$expected=((Get-Content (Join-Path $root "SHA256SUMS.txt")|Select-Object -First 1)-split"\s+")[0].ToLower();$actual=(Get-FileHash $target -Algorithm SHA256).Hash.ToLower();if($actual-ne$expected){throw"CHECKSUM FAILED"};Write-Host "SHA-256 verified" -ForegroundColor Green;if($Install){Start-Process $target}
'@|Set-Content "$dist/VERIFY_INSTALLER.ps1" -Encoding UTF8
'@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_INSTALLER.ps1" -Install
if errorlevel 1 (pause & exit /b 1)'|Set-Content "$dist/INSTALL_VERIFIED.cmd" -Encoding ASCII
@'
MATH TACTICAL CLASSROOM V60.7 · MASTERY BOSS EDITION

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Design target:
- This version is tuned for repeated mastery and a high death count, not an artificial forced-loss gate. Actual deaths depend on player skill, so no build can honestly guarantee exactly 30 deaths.
- The boss records boss-room deaths during the mission. At 30 deaths it enables only a bounded assist: +0.07 s telegraph, +0.02 s dodge i-frames, +0.22 s recovery. Victory is never locked before 30.

Boss fight:
- Phase 1 / 2 / 3: 4 / 6 / 8 dash chains.
- Dash speeds: 820 / 990 / 1160.
- Shield: 6 / 8 / 10 hits.
- Core armor after shield break: 3 / 4 / 5 controlled hits, with a short anti-burst gate between accepted hits.
- Dodge i-frames: 0.18 s; cooldown: 0.38 s.
- Amber lane tracks. Red lane is committed. The endpoint ring keeps shrinking; a white flash is the final release cue.
- Cadence varies among STANDARD, HOLD, QUICK and LATE. The red lock alone is not the dodge button; read the release timing.
- Perfect dodge does NOT remove shield. It builds extra punish/recovery time after the chain, so defense must still convert into accurate offense.
- Committed dashes never home after lock. Projectile pressure remains after dash impact rather than hiding inside the telegraph.
- Room 5 starts immediately and a direct dash hit remains lethal unless the dodge is timed correctly.

Preserved: 45-minute mission, 90-second questions with AYUDA INICIAL, Teacher Mode Rooms 1–5 + F8, permanent boss-room floor weapons, fast normal enemies, encrypted local results.
'@|Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8
$keep=@($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt");Get-ChildItem $dist -Force|Where-Object{$keep-notcontains$_.Name}|Remove-Item -Recurse -Force;if((Get-ChildItem $dist -File).Count-ne5){throw"Unexpected package files."}
