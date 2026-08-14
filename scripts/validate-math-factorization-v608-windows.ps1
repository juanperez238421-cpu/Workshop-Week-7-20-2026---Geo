$ErrorActionPreference = "Stop"
$dist = Resolve-Path "dist/math-factorization-v60-combined-v608-windows"
$installerName = "Math-Tactical-Classroom-V60.8-Combined-Factorization-Setup-60.8.0-Local-x64.exe"
$installer = Get-ChildItem $dist -Filter $installerName -File | Select-Object -First 1
if (-not $installer -or $installer.Length -lt 70000000) { throw "V60.8 installer missing or unexpectedly small." }
$stream = [IO.File]::OpenRead($installer.FullName); try { $a=$stream.ReadByte(); $b=$stream.ReadByte() } finally { $stream.Dispose() }
if ($a -ne 0x4D -or $b -ne 0x5A) { throw "Installer is not a Windows PE file." }

$installDir = Join-Path $env:RUNNER_TEMP "MathTacticalV608Combined"
$ready = Join-Path $env:RUNNER_TEMP "math-v608-ready.json"
$bossReady = Join-Path $env:RUNNER_TEMP "math-v608-boss-ready.json"
$teacherReady = Join-Path $env:RUNNER_TEMP "math-v608-teacher-ready.json"
$questionReady = Join-Path $env:RUNNER_TEMP "math-v608-question-ready.json"
$vaultFile = Join-Path $env:RUNNER_TEMP "math-v608-vault-self-test.json"
$stdoutFile = Join-Path $env:RUNNER_TEMP "math-v608-stdout.log"
$stderrFile = Join-Path $env:RUNNER_TEMP "math-v608-stderr.log"
$errorFile = "math-v608-validation-error.log"
function Stop-App { Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Math Tactical Classroom V60.8*" -or $_.ProcessName -like "Math-Tactical-Classroom-V60.8*" } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }
function Wait-Ready([string]$File,[string]$Phase,[int]$Seconds=120) { for($i=0;$i-lt$Seconds;$i++){ Start-Sleep 1; if(Test-Path $File){ try{$x=Get-Content $File -Raw|ConvertFrom-Json; if($x.renderer.phase -eq $Phase){return $x}}catch{} } }; throw "Timed out waiting for $Phase" }
function Launch([string]$File){ $env:V60_READY_FILE=$File; Start-Process $script:exe.FullName -WorkingDirectory $script:exe.DirectoryName -ArgumentList @("--disable-gpu") -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru }
trap { ("V60.8 runtime validation failed.`r`n"+$_.Exception.Message)|Set-Content $errorFile; foreach($p in @(@($ready,"math-v608-ready-last.json"),@($bossReady,"math-v608-boss-last.json"),@($teacherReady,"math-v608-teacher-last.json"),@($questionReady,"math-v608-question-last.json"),@($vaultFile,"math-v608-vault-last.json"),@($stdoutFile,"math-v608-stdout.log"),@($stderrFile,"math-v608-stderr.log"))){if(Test-Path $p[0]){Copy-Item $p[0] $p[1]-Force}}; Stop-App; Write-Error $_; exit 1 }

Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ready,$bossReady,$teacherReady,$questionReady,$vaultFile,$stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
$p=Start-Process $installer.FullName -ArgumentList @("/S","/D=$installDir") -Wait -PassThru; if($p.ExitCode-ne0){throw "Silent install failed."}
$script:exe=Get-ChildItem $installDir -Filter "*.exe" -File -Recurse|Where-Object{$_.Name-notmatch"(?i)uninstall"}|Sort-Object Length -Descending|Select-Object -First 1
if(-not $script:exe -or $script:exe.Length-lt100000000){throw "Installed app payload invalid."}
$env:V60_SELF_TEST_FILE=$vaultFile; $env:MATH_V60_TEACHER_PIN="9109"; $env:V60_TEACHER_PIN="9109"; $env:V60_ALLOW_SECOND_INSTANCE="true"; $env:ELECTRON_ENABLE_LOGGING="1"; $env:V60_BOSS_PROBE="false"
Remove-Item Env:V60_TEACHER_PROBE,Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue

Launch $ready|Out-Null; $r=Wait-Ready $ready "renderer-bootstrap"
if($r.version-ne"60.8.0" -or $r.edition-ne"math-factorization-combined-cases-v608"){throw "Wrong V60.8 identity."}
if($r.renderer.fixedMatchSeconds-ne2700 -or $r.renderer.questionSeconds-ne90 -or $r.renderer.levels-ne5){throw "Core timing/room contract failed."}
if($r.renderer.teacherModeAvailable-ne$true -or $r.renderer.teacherRoomCount-ne5 -or $r.renderer.factorizationCaseCount-ne5 -or $r.renderer.factorizationInitialStepHelp-ne$true){throw "Teacher/factorization contract failed."}
if($r.renderer.mathVerifiedQuestionBank-ne$true -or $r.renderer.algebraicallyUniqueAnswerOptions-ne$true -or $r.renderer.combinedFactorizationCentral-ne$true -or $r.renderer.strictOptionObjectIds-ne$true -or $r.renderer.runtimeOptionIntegrityGuard-ne$true){throw "Combined-factorization / strict option readiness markers failed."}
if($r.renderer.bossVariableDashCadence-ne$true -or $r.renderer.bossCoreMultiHitArmor-ne$true -or $r.renderer.bossMasteryTargetDeaths-ne30){throw "V60.7 Mastery boss regressed."}
if(@($r.renderer.bossDashChainsByPhase)-join"," -ne "4,6,8" -or @($r.renderer.bossCoreHitsRequiredByPhase)-join"," -ne "3,4,5"){throw "Mastery phase escalation failed."}
for($i=0;$i-lt45-and-not(Test-Path $vaultFile);$i++){Start-Sleep 1}; if(-not(Test-Path $vaultFile)){throw "Vault self-test missing."}; $v=Get-Content $vaultFile -Raw|ConvertFrom-Json; if($v.ok-ne$true -or $v.encryptedSave-ne$true -or $v.wrongPinRejected-ne$true -or $v.correctPinUnlocked-ne$true){throw "Vault checks failed."}; Stop-App

$env:V60_BOSS_PROBE="true"; Remove-Item Env:V60_TEACHER_PROBE,Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $bossReady|Out-Null; $b=Wait-Ready $bossReady "room5-boss-probe"
if($b.renderer.bossPresent-ne$true -or $b.renderer.bossHealthPhases-ne3 -or $b.renderer.bossShieldMaxHitPoints-ne6){throw "Mastery boss probe failed."}
if($b.renderer.bossPerfectDodgeBuildsCounterFocus-ne$true -or $b.renderer.bossPerfectDodgeDamagesShield-ne$false -or $b.renderer.bossCoreOneHitDoesNotAdvancePhase-ne$true){throw "Mastery boss damage loop regressed."}
if($b.renderer.roomWeaponPickupFunctional-ne$true -or $b.renderer.roomWeaponCount-lt6){throw "Boss-room floor weapons regressed."}; Stop-App

$env:V60_BOSS_PROBE="false"; $env:V60_TEACHER_PROBE="5"; Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue
Launch $teacherReady|Out-Null; $t=Wait-Ready $teacherReady "teacher-room-probe"; if($t.renderer.teacherMode-ne$true -or $t.renderer.currentRoom-ne5 -or $t.renderer.teacherSessionsExcludedFromGrades-ne$true){throw "Teacher Room 5 access failed."}; Stop-App

Remove-Item Env:V60_TEACHER_PROBE -ErrorAction SilentlyContinue
$questionTypes=@("common-difference-squares","common-perfect-square","common-general-trinomial","grouping-difference-squares","common-grouping")
foreach($questionType in $questionTypes){
  Remove-Item $questionReady -Force -ErrorAction SilentlyContinue
  $env:V60_QUESTION_PREVIEW=$questionType
  Launch $questionReady|Out-Null; $q=Wait-Ready $questionReady "question-layout-preview"
  if($q.renderer.questionType-ne$questionType){throw "Preview did not generate requested combined type $questionType."}
  if($q.renderer.questionSeconds-ne90 -or $q.renderer.factorizationInitialStepHelp-ne$true -or $q.renderer.questionLayoutFitsViewport-ne$true){throw "Question runtime/layout failed for $questionType."}
  if($q.renderer.combinedFactorizationCentral-ne$true -or $q.renderer.strictOptionObjectIds-ne$true -or $q.renderer.runtimeOptionIntegrityGuard-ne$true){throw "Strict combined-choice markers missing for $questionType."}
  if($q.renderer.questionCorrectOptionPresent-ne$true -or $q.renderer.questionRenderedCorrectOptionPresent-ne$true){throw "Correct option is not both generated and rendered for $questionType."}
  if($q.renderer.questionOptionCount-ne4 -or $q.renderer.questionRenderedOptionCount-ne4 -or $q.renderer.questionRenderedUniqueOptionCount-ne4){throw "Exactly four unique visible options required for $questionType."}
  $ids=@($q.renderer.questionRenderedOptionIds); $texts=@($q.renderer.questionRenderedOptionTexts)
  if($ids.Count-ne4 -or @($ids|Select-Object -Unique).Count-ne4 -or $texts.Count-ne4 -or @($texts|Select-Object -Unique).Count-ne4){throw "Duplicate rendered ID/text detected for $questionType."}
  if($texts -contains "[object Object]" -or [string]::IsNullOrWhiteSpace([string]$q.renderer.questionCorrectOptionId)){throw "Object-rendering or correct-ID failure for $questionType."}
  if(-not $q.renderer.questionCorrectSignature -or @($q.renderer.questionSourceCoefficients).Count-lt4){throw "Combined question verification metadata missing for $questionType."}
  Stop-App
}
Remove-Item Env:V60_QUESTION_PREVIEW -ErrorAction SilentlyContinue

Get-Content $ready,$bossReady,$teacherReady,$questionReady,$vaultFile|Tee-Object math-v608-startup.log -Append|Out-Null
$un=Get-ChildItem $installDir -Filter "*Uninstall*.exe" -File -Recurse|Select-Object -First 1; if($un){$u=Start-Process $un.FullName -ArgumentList "/S" -Wait -PassThru; if($u.ExitCode-ne0){throw "Uninstall failed."}}
$hash=(Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower(); "$hash  $installerName"|Set-Content "$dist/SHA256SUMS.txt" -Encoding ascii; "V60.8 combined factorization validated $hash"|Tee-Object math-v608-installer.log
@'
param([switch]$Install)
$ErrorActionPreference="Stop";$root=Split-Path -Parent $MyInvocation.MyCommand.Path;$name="Math-Tactical-Classroom-V60.8-Combined-Factorization-Setup-60.8.0-Local-x64.exe";$target=Join-Path $root $name;$expected=((Get-Content (Join-Path $root "SHA256SUMS.txt")|Select-Object -First 1)-split"\s+")[0].ToLower();$actual=(Get-FileHash $target -Algorithm SHA256).Hash.ToLower();if($actual-ne$expected){throw"CHECKSUM FAILED"};Write-Host "SHA-256 verified" -ForegroundColor Green;if($Install){Start-Process $target}
'@|Set-Content "$dist/VERIFY_INSTALLER.ps1" -Encoding UTF8
'@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_INSTALLER.ps1" -Install
if errorlevel 1 (pause & exit /b 1)'|Set-Content "$dist/INSTALL_VERIFIED.cmd" -Encoding ASCII
@'
MATH TACTICAL CLASSROOM V60.8 · COMBINED FACTORIZATION

Extract the ZIP and run INSTALL_VERIFIED.cmd.

Central mathematics theme:
- Every checkpoint now combines at least two factorization stages.
- Combo 1: common factor -> difference of squares.
- Combo 2: common factor -> perfect-square trinomial.
- Combo 3: common factor -> general trinomial.
- Combo 4: grouping -> difference of squares.
- Combo 5: common factor -> grouping.
- Students must continue until the expression is completely factored; stopping after the first case is not accepted.

Multiple-choice integrity redesign:
- Options are structured objects with unique IDs; answer grading no longer compares visible strings.
- Exactly four choices are created and the correct option is never trimmed away.
- Visible text is deduplicated separately from algebraic coefficient signatures.
- A runtime DOM guard refuses to show a checkpoint unless all four rendered choices have unique IDs/text and the correct option is present.
- The Windows validator opens all five combined-case previews from the installed EXE and checks 4 rendered choices, 4 unique texts, 4 unique IDs and a rendered correct answer.
- Independent build audit expands 50,000 generated questions and every option mathematically.

Preserved: V60.7 Mastery boss balance, 45-minute mission, 90-second questions, Teacher Mode Rooms 1–5 + F8, permanent boss-room weapons and encrypted local results.
'@|Set-Content "$dist/README_INSTALLER.txt" -Encoding UTF8
$keep=@($installerName,"SHA256SUMS.txt","VERIFY_INSTALLER.ps1","INSTALL_VERIFIED.cmd","README_INSTALLER.txt");Get-ChildItem $dist -Force|Where-Object{$keep-notcontains$_.Name}|Remove-Item -Recurse -Force;if((Get-ChildItem $dist -File).Count-ne5){throw"Unexpected package files."}
