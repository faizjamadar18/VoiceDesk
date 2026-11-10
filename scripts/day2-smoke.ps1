#requires -Version 5.1
<#
  Day 2 smoke test for Kestrel.

  Proves the hold-to-talk dictation pipeline end to end with the fake ASR
  provider and the real microphone:
    1. the local API starts on a test-only port and reports provider=fake,
    2. the built app registers Ctrl+Space and starts its low-level key hook,
    3. a hidden Kestrel does not steal focus while a separate app is typed into,
    4. holding the chord records, transcribes, and pastes the expected text
       into the foreground app without Kestrel ever becoming visible,
    5. Ctrl+A / Ctrl+C in the target reads back the same text,
    6. a tap still summons and focuses Kestrel,
    7. no audio file is written anywhere the privacy check looks.

  Run from the repository root:
    powershell -ExecutionPolicy Bypass -File .\scripts\day2-smoke.ps1

  The script launches a production build, so run `npm run build` first.
#>
[CmdletBinding()]
param(
  [string]$LogPath,
  [string]$ConsoleLogPath,
  [string]$ApiLogPath,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$desktopDir = Join-Path $root 'apps\desktop'
$apiDir = Join-Path $root 'apps\api'
$logsDir = Join-Path $root 'logs'
$electronExe = Join-Path $root 'node_modules\electron\dist\electron.exe'
$apiPython = Join-Path $apiDir '.venv\Scripts\python.exe'
$appMain = Join-Path $desktopDir 'out\main\index.js'

$testPort = 8791
$expectedTranscript = 'Kestrel day two smoke 4821.'
$testStartedAt = Get-Date

if (-not $LogPath) { $LogPath = Join-Path $logsDir 'day2-smoke.log' }
if (-not $ConsoleLogPath) { $ConsoleLogPath = Join-Path $logsDir 'day2-smoke-console.log' }
if (-not $ApiLogPath) { $ApiLogPath = Join-Path $logsDir 'day2-api.log' }
if (-not $ScreenshotPath) { $ScreenshotPath = Join-Path $logsDir 'day2-window.png' }
$LogPath = [IO.Path]::GetFullPath($LogPath)
$ConsoleLogPath = [IO.Path]::GetFullPath($ConsoleLogPath)
$ApiLogPath = [IO.Path]::GetFullPath($ApiLogPath)
$ScreenshotPath = [IO.Path]::GetFullPath($ScreenshotPath)

# --- Preconditions ---------------------------------------------------------

if (-not (Test-Path -LiteralPath $electronExe)) {
  throw "Electron is not installed at $electronExe. Run 'npm install' first."
}
if (-not (Test-Path -LiteralPath $appMain)) {
  throw "No production build found at $appMain. Run 'npm run build' first."
}
if (-not (Test-Path -LiteralPath $apiPython)) {
  throw "The API virtualenv is missing at $apiPython. Create it with 'python -m venv apps\api\.venv' and install apps\api\requirements-dev.txt."
}

$sharedTypesPath = Join-Path $desktopDir 'src\shared\types.ts'
$hotkeyDefinition = [regex]::Match(
  (Get-Content -LiteralPath $sharedTypesPath -Raw),
  "export const HOTKEY = '([^']+)'"
)
if (-not $hotkeyDefinition.Success) {
  throw "Could not read HOTKEY from $sharedTypesPath."
}
$hotkey = $hotkeyDefinition.Groups[1].Value
$hotkeyLogPattern = [regex]::Escape($hotkey)

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ConsoleLogPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ApiLogPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ScreenshotPath) | Out-Null

Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ApiLogPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ScreenshotPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ConsoleLogPath -Force -ErrorAction SilentlyContinue

$script:failures = New-Object System.Collections.Generic.List[string]

$transcriptStarted = $false
try {
  Start-Transcript -Path $ConsoleLogPath -Force | Out-Null
  $transcriptStarted = $true
} catch {
  Write-Host "WARN  Could not start the console transcript: $($_.Exception.Message)" -ForegroundColor Yellow
}

# --- Native helpers (same Windows techniques as the Day 1 smoke) -----------

Add-Type @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct KestrelDay2Rect {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public static class KestrelDay2Native {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out KestrelDay2Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

[KestrelDay2Native]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Check {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if ($Condition) {
    Write-Host "PASS  $Message" -ForegroundColor Green
  } else {
    Write-Host "FAIL  $Message" -ForegroundColor Red
    $script:failures.Add($Message) | Out-Null
  }
}

function Wait-For {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds,
    [string]$FailureMessage
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $result = & $Condition
    if ($result) { return $result }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  throw $FailureMessage
}

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds,
    [int]$IntervalMilliseconds = 100
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return $true }
    Start-Sleep -Milliseconds $IntervalMilliseconds
  } while ((Get-Date) -lt $deadline)

  return [bool](& $Condition)
}

function Get-LogLines {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  return @(Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)
}

function Get-NewLogSegment {
  param(
    [string]$Path,
    [int]$Skip
  )

  $lines = @(Get-LogLines -Path $Path)
  if ($Skip -ge $lines.Count) { return @() }
  return @($lines[$Skip..($lines.Count - 1)])
}

function Get-LogText {
  param([string]$Path)

  $text = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $text) { return '' }
  return $text
}

function Get-KestrelProcesses {
  Get-Process electron -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $electronExe }
}

function Get-KestrelProcess {
  Get-KestrelProcesses |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
}

function Stop-KestrelProcesses {
  Get-KestrelProcesses |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
}

function Stop-TestBackendProcesses {
  # Only the API instance this smoke owns: uvicorn app.main:app on port 8791.
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'app\.main:app' -and
      $_.CommandLine -match '8791'
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Get-PortListenerPid {
  param([int]$Port)

  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { return $null }
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) { return $connection.OwningProcess }
  return $null
}

function Stop-ProcessTree {
  param($Process)

  if (-not $Process) { return }
  try {
    if (-not $Process.HasExited) {
      & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
    }
  } catch {
    # Process already exited between the check and taskkill.
  }
}

function Set-TestWindowForeground {
  param([IntPtr]$WindowHandle)

  $foreground = [KestrelDay2Native]::GetForegroundWindow()
  $foregroundPid = 0
  $foregroundThread = [KestrelDay2Native]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  $targetPid = 0
  $targetThread = [KestrelDay2Native]::GetWindowThreadProcessId($WindowHandle, [ref]$targetPid)

  # Windows refuses plain SetForegroundWindow calls from a background process.
  # Attach to the foreground thread so the test target can legitimately take focus.
  [KestrelDay2Native]::ShowWindow($WindowHandle, 9) | Out-Null
  if ($foregroundThread -ne $targetThread) {
    [KestrelDay2Native]::AttachThreadInput($foregroundThread, $targetThread, $true) | Out-Null
    [KestrelDay2Native]::BringWindowToTop($WindowHandle) | Out-Null
    [KestrelDay2Native]::SetForegroundWindow($WindowHandle) | Out-Null
    [KestrelDay2Native]::SetActiveWindow($WindowHandle) | Out-Null
    [KestrelDay2Native]::AttachThreadInput($foregroundThread, $targetThread, $false) | Out-Null
  } else {
    [KestrelDay2Native]::SetForegroundWindow($WindowHandle) | Out-Null
  }

  Start-Sleep -Milliseconds 300
}

function Get-VirtualKeyCode {
  param([string]$Key)

  switch ($Key.ToLowerInvariant()) {
    'control' { return 0x11 }
    'ctrl' { return 0x11 }
    'alt' { return 0x12 }
    'shift' { return 0x10 }
    'space' { return 0x20 }
    'tab' { return 0x09 }
    'enter' { return 0x0D }
    'escape' { return 0x1B }
    default {
      if ($Key.Length -eq 1 -and $Key -match '^[A-Za-z0-9]$') {
        $upper = $Key.ToUpperInvariant()
        return [int][char]$upper
      }
      throw "Unsupported key '$Key' in HOTKEY."
    }
  }
}

function Send-KestrelTap {
  # The app's HOTKEY definition: press in order, release in reverse so the
  # final key (Space) ends the gesture before Ctrl is released.
  foreach ($code in $script:hotkeyCodes) {
    [KestrelDay2Native]::keybd_event([byte]$code, 0, 0, [UIntPtr]::Zero)
  }
  Start-Sleep -Milliseconds 60

  $releaseCodes = @($script:hotkeyCodes)
  [array]::Reverse($releaseCodes)
  foreach ($code in $releaseCodes) {
    [KestrelDay2Native]::keybd_event([byte]$code, 0, 2, [UIntPtr]::Zero)
  }
}

$script:hotkeyCodes = @($hotkey -split '\+' | ForEach-Object { Get-VirtualKeyCode $_ })

function Save-WindowScreenshot {
  param(
    [IntPtr]$WindowHandle,
    [string]$Path
  )

  $rect = New-Object KestrelDay2Rect
  if (-not [KestrelDay2Native]::GetWindowRect($WindowHandle, [ref]$rect)) {
    Write-Host 'NOTE  Could not read the window rectangle; no screenshot saved.' -ForegroundColor Yellow
    return
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    Write-Host 'NOTE  Window has no drawable size; no screenshot saved.' -ForegroundColor Yellow
    return
  }

  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  try {
    [KestrelDay2Native]::PrintWindow($WindowHandle, $hdc, 2) | Out-Null
  } finally {
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Host "Screenshot: $Path" -ForegroundColor Cyan
}

# --- Test body -------------------------------------------------------------

$backendLauncherPath = Join-Path $env:TEMP ("kestrel-day2-api-" + [Guid]::NewGuid().ToString('N') + '.cmd')
$appLauncherPath = Join-Path $env:TEMP ("kestrel-day2-app-" + [Guid]::NewGuid().ToString('N') + '.cmd')
$targetScriptPath = Join-Path $env:TEMP ("kestrel-day2-target-" + [Guid]::NewGuid().ToString('N') + '.ps1')
$targetOutputPath = Join-Path $env:TEMP ("kestrel-day2-text-" + [Guid]::NewGuid().ToString('N') + '.txt')
$targetErrorPath = Join-Path $env:TEMP ("kestrel-day2-target-error-" + [Guid]::NewGuid().ToString('N') + '.txt')

$backendLauncher = $null
$appLauncher = $null
$kestrel = $null
$target = $null
$kestrelHwnd = [IntPtr]::Zero
$previousClipboard = $null
$hadClipboard = $false
$keyupToPasteMs = $null

try {
  try { $previousClipboard = Get-Clipboard -Raw -ErrorAction Stop } catch { $previousClipboard = $null }
  $hadClipboard = $null -ne $previousClipboard

  # A stale instance would make the single-instance lock silently swallow the test launch.
  Stop-KestrelProcesses
  Stop-TestBackendProcesses
  $portDeadline = (Get-Date).AddSeconds(5)
  while ((Get-PortListenerPid -Port $testPort) -and (Get-Date) -lt $portDeadline) {
    Start-Sleep -Milliseconds 200
  }
  $portOwner = Get-PortListenerPid -Port $testPort
  if ($portOwner) {
    throw "Port $testPort is already in use by PID $portOwner. Stop that process and re-run the smoke test."
  }
  Start-Sleep -Milliseconds 500

  Write-Host ''
  Write-Host 'Kestrel Day 2 smoke test' -ForegroundColor Cyan
  Write-Host "Log: $LogPath"
  Write-Host "API log: $ApiLogPath"
  Write-Host "Console log: $ConsoleLogPath"
  Write-Host "Expected fake transcript: $expectedTranscript"
  Write-Host ''

  # 1. Local API on a test-only port.
  @"
@echo off
cd /d "$apiDir"
set "KESTREL_ASR_PROVIDER=fake"
set "KESTREL_FAKE_TRANSCRIPT=$expectedTranscript"
"$apiPython" -m uvicorn app.main:app --host 127.0.0.1 --port $testPort > "$ApiLogPath" 2>&1
"@ | Set-Content -LiteralPath $backendLauncherPath -Encoding ASCII

  $backendLauncher = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', "`"$backendLauncherPath`"" -WindowStyle Hidden -PassThru

  $health = Wait-For -TimeoutSeconds 30 -FailureMessage 'The API did not become healthy on port 8791 within 30 seconds.' -Condition {
    if ($backendLauncher.HasExited) {
      $tail = (Get-Content -LiteralPath $ApiLogPath -Tail 20 -ErrorAction SilentlyContinue) -join "`n"
      throw "The API launcher exited early.`n$tail"
    }
    try {
      Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/health" -UseBasicParsing -TimeoutSec 2
    } catch {
      $null
    }
  }
  Check ($health.status -eq 'ok' -and $health.provider -eq 'fake' -and $health.configured -eq $true) 'API health reports provider=fake and configured=true'

  # 2. Built app pointed at the test API.
  @"
@echo off
cd /d "$desktopDir"
set "KESTREL_API_URL=http://127.0.0.1:$testPort"
"$electronExe" . > "$LogPath" 2>&1
"@ | Set-Content -LiteralPath $appLauncherPath -Encoding ASCII

  $appLauncher = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', "`"$appLauncherPath`"" -WindowStyle Hidden -PassThru

  $kestrel = Wait-For -TimeoutSeconds 30 -FailureMessage 'Kestrel did not open a window within 30 seconds.' -Condition {
    if ($appLauncher.HasExited) {
      $tail = (Get-Content -LiteralPath $LogPath -Tail 20 -ErrorAction SilentlyContinue) -join "`n"
      throw "The Kestrel launcher exited early.`n$tail"
    }
    Get-KestrelProcess
  }

  $kestrelHwnd = $kestrel.MainWindowHandle
  Write-Host "App pid=$($kestrel.Id) hwnd=$kestrelHwnd" -ForegroundColor DarkGray
  Check ([KestrelDay2Native]::IsWindowVisible($kestrelHwnd)) 'app opens with a visible window'

  $hotkeyReady = Wait-Until -TimeoutSeconds 30 -IntervalMilliseconds 250 -Condition {
    $text = Get-LogText -Path $LogPath
    ($text -match "\[hotkey\] $hotkeyLogPattern registered=") -and
    ($text -match '\[hotkey\] hook started=')
  }
  $readyLog = Get-LogText -Path $LogPath
  Check ($readyLog -match "\[hotkey\] $hotkeyLogPattern registered=true") "global hotkey registered (${hotkey})"
  Check ($readyLog -match '\[hotkey\] hook started=true') 'low-level dictation hook started'
  if (-not $hotkeyReady -or $readyLog -notmatch "\[hotkey\] $hotkeyLogPattern registered=true" -or $readyLog -notmatch '\[hotkey\] hook started=true') {
    $tail = (Get-Content -LiteralPath $LogPath -Tail 30 -ErrorAction SilentlyContinue) -join "`n"
    throw "Kestrel's hotkey/hook did not become ready; the hold test cannot run.`n$tail"
  }

  # 3. Hide Kestrel to the tray.
  $null = $kestrel.CloseMainWindow()
  $hidden = Wait-Until -TimeoutSeconds 5 -IntervalMilliseconds 200 -Condition {
    -not [KestrelDay2Native]::IsWindowVisible($kestrelHwnd)
  }
  Check $hidden 'closing the window hides it to the tray'
  if (-not $hidden) { throw 'Could not hide the Kestrel window; the focus/privacy checks would be invalid.' }

  # 4. Separate WinForms target with a focused multiline TextBox.
  $targetScript = @'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:outputPath = '__OUTPUT_PATH__'
$script:utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList @($false)
[System.IO.File]::WriteAllText($script:outputPath, '', $script:utf8)

$script:form = New-Object System.Windows.Forms.Form
$script:form.Text = 'Kestrel Day 2 Target'
$script:form.Width = 720
$script:form.Height = 420
$script:form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen

$script:textBox = New-Object System.Windows.Forms.TextBox
$script:textBox.Multiline = $true
$script:textBox.Dock = [System.Windows.Forms.DockStyle]::Fill
$script:textBox.AcceptsReturn = $true
$script:textBox.AcceptsTab = $true
$script:textBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$script:form.Controls.Add($script:textBox)

$script:timer = New-Object System.Windows.Forms.Timer
$script:timer.Interval = 50
$script:timer.Add_Tick({
  try {
    [System.IO.File]::WriteAllText($script:outputPath, $script:textBox.Text, $script:utf8)
  } catch {
  }
})

$script:form.Add_Shown({
  $script:form.ActiveControl = $script:textBox
  $script:form.Activate()
  $script:textBox.Focus()
  $script:textBox.Select()
  $script:timer.Start()
})
$script:form.Add_Activated({
  $script:textBox.Focus()
})

# Start before the message loop as well; relying only on Shown can miss the
# first ticks if Windows forces the form foreground during startup.
$script:timer.Start()
[System.Windows.Forms.Application]::Run($script:form)
'@
  $targetScript = $targetScript.Replace('__OUTPUT_PATH__', $targetOutputPath.Replace("'", "''"))
  Set-Content -LiteralPath $targetScriptPath -Value $targetScript -Encoding ASCII

  # Hidden console: the form is the only visible window for the target, so the
  # test harness cannot reclaim focus through its own terminal window.
  $target = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$targetScriptPath`"" `
    -RedirectStandardError $targetErrorPath -PassThru

  $targetHwnd = Wait-For -TimeoutSeconds 15 -FailureMessage 'The background WinForms target did not open.' -Condition {
    $target.Refresh()
    if ($target.HasExited) {
      $tail = (Get-Content -LiteralPath $targetErrorPath -Tail 20 -ErrorAction SilentlyContinue) -join "`n"
      throw "The WinForms target exited early.`n$tail"
    }
    if ($target.MainWindowHandle -ne 0) { $target.MainWindowHandle } else { $null }
  }

  $null = Wait-Until -TimeoutSeconds 5 -IntervalMilliseconds 100 -Condition { Test-Path -LiteralPath $targetOutputPath }

  # Windows can refuse the first foreground change; retry briefly.
  $foregroundDeadline = (Get-Date).AddSeconds(5)
  do {
    Set-TestWindowForeground -WindowHandle $targetHwnd
    $foregroundBeforeHold = [KestrelDay2Native]::GetForegroundWindow()
  } while ($foregroundBeforeHold -ne $targetHwnd -and (Get-Date) -lt $foregroundDeadline)

  if ($foregroundBeforeHold -ne $targetHwnd) {
    $foregroundPid = 0
    [KestrelDay2Native]::GetWindowThreadProcessId($foregroundBeforeHold, [ref]$foregroundPid) | Out-Null
    $foregroundProcess = Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue
    Write-Host "DEBUG foreground before hold hwnd=$foregroundBeforeHold pid=$foregroundPid process=$($foregroundProcess.ProcessName) title=$($foregroundProcess.MainWindowTitle)" -ForegroundColor DarkYellow
  }
  Check ($foregroundBeforeHold -eq $targetHwnd) 'target app owns the foreground before the hold'
  if ($foregroundBeforeHold -ne $targetHwnd) {
    throw 'Could not give the target app foreground; refusing to send the dictation chord.'
  }

  # 5. Hold test.
  $logLineCountBeforeHold = @(Get-LogLines -Path $LogPath).Count
  $visibleDuringHold = $true
  $visibleAfterKeyup = $true

  foreach ($code in $script:hotkeyCodes) {
    [KestrelDay2Native]::keybd_event([byte]$code, 0, 0, [UIntPtr]::Zero)
  }
  Start-Sleep -Milliseconds 400
  $visibleDuringHold = [KestrelDay2Native]::IsWindowVisible($kestrelHwnd)
  Start-Sleep -Milliseconds 450

  # The gesture ends on the first release in reverse order (Space for
  # Control+Space). Start the latency stopwatch at that key-up.
  $releaseCodes = @($script:hotkeyCodes)
  [array]::Reverse($releaseCodes)
  $keyupWatch = [Diagnostics.Stopwatch]::StartNew()
  [KestrelDay2Native]::keybd_event([byte]$releaseCodes[0], 0, 2, [UIntPtr]::Zero)
  $keyupAt = Get-Date
  Start-Sleep -Milliseconds 40
  for ($i = 1; $i -lt $releaseCodes.Count; $i++) {
    [KestrelDay2Native]::keybd_event([byte]$releaseCodes[$i], 0, 2, [UIntPtr]::Zero)
  }

  $foregroundAfterKeyup = [KestrelDay2Native]::GetForegroundWindow()
  $visibleAfterKeyup = [KestrelDay2Native]::IsWindowVisible($kestrelHwnd)
  Write-Host "Key-up at $($keyupAt.ToString('HH:mm:ss.fff'))" -ForegroundColor DarkGray

  $textMatched = $false
  $currentTargetText = $null
  $textDeadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $textDeadline) {
    try {
      if (Test-Path -LiteralPath $targetOutputPath) {
        $currentTargetText = [IO.File]::ReadAllText($targetOutputPath, [Text.Encoding]::UTF8)
        if ($currentTargetText -ceq $expectedTranscript) {
          $textMatched = $true
          break
        }
      }
    } catch {
      # The target may be mid-write; retry on the next tick.
    }
    Start-Sleep -Milliseconds 50
  }
  $keyupWatch.Stop()
  $keyupToPasteMs = [int]$keyupWatch.ElapsedMilliseconds

  Check ($visibleDuringHold -eq $false -and $visibleAfterKeyup -eq $false) 'Kestrel stayed hidden while recording (no focus steal)'
  Check ($foregroundAfterKeyup -eq $targetHwnd) 'target app still owns the foreground after keyup'

  if ($textMatched) {
    Check $true ("target received the exact fake transcript (keyup-to-paste {0} ms)" -f $keyupToPasteMs)
    Write-Host ("MEASURE  keyup-to-paste {0} ms" -f $keyupToPasteMs) -ForegroundColor Cyan
  } else {
    $shown = if ($null -eq $currentTargetText) { '<none>' } else { $currentTargetText }
    Check $false ("target text did not match the fake transcript (saw: '{0}', keyup-to-paste window {1} ms)" -f $shown, $keyupToPasteMs)
  }

  # Give the main process time to flush the paste log line.
  $null = Wait-Until -TimeoutSeconds 3 -IntervalMilliseconds 100 -Condition {
    (Get-NewLogSegment -Path $LogPath -Skip $logLineCountBeforeHold) -match '\[dictation\] pasted in'
  }
  $holdSegment = @(Get-NewLogSegment -Path $LogPath -Skip $logLineCountBeforeHold)
  $holdSegmentText = $holdSegment -join "`n"

  Check ($holdSegmentText -match '\[dictation\] start') 'app log records the dictation start'
  $stopMatch = [regex]::Match($holdSegmentText, '\[dictation\] stop holdMs=(\d+)')
  $stopHoldMs = if ($stopMatch.Success) { [int]$stopMatch.Groups[1].Value } else { -1 }
  Check ($stopMatch.Success -and $stopHoldMs -ge 250) ("app log records a hold of at least 250 ms (holdMs={0})" -f $stopHoldMs)

  $audioMatch = [regex]::Match($holdSegmentText, '\[dictation\] audio bytes=(\d+) mime=(\S+)')
  $audioBytes = if ($audioMatch.Success) { [int64]$audioMatch.Groups[1].Value } else { 0 }
  Check ($audioMatch.Success -and $audioBytes -gt 0) ("app log records non-empty in-memory audio (bytes={0})" -f $audioBytes)
  Check ($holdSegmentText -match '\[dictation\] transcript provider=fake latencyMs=\d+ chars=\d+') 'app log records the fake-provider transcript'
  Check ($holdSegmentText -match '\[dictation\] pasted in \d+ms') 'app log records the paste'
  Check ($holdSegmentText -notmatch '\[dictation\] (error|mic-error)') 'app log contains no dictation error or mic-error'

  $pasteIndex = -1
  for ($i = 0; $i -lt $holdSegment.Count; $i++) {
    if ($holdSegment[$i] -match '\[dictation\] pasted in') { $pasteIndex = $i; break }
  }
  if ($pasteIndex -gt 0) {
    $beforePasteText = ($holdSegment[0..($pasteIndex - 1)] -join "`n")
  } elseif ($pasteIndex -eq 0) {
    $beforePasteText = ''
  } else {
    $beforePasteText = $holdSegmentText
  }
  Check ($beforePasteText -notmatch '\[window\] focus') 'Kestrel did not take window focus during the hold'

  # 6. Clipboard cross-check. The app's paste already put the transcript on
  # the clipboard, so replace it with a sentinel first; otherwise the check
  # could pass without the target copying anything.
  $clipboardDeadline = (Get-Date).AddSeconds(5)
  do {
    $foregroundForCopy = [KestrelDay2Native]::GetForegroundWindow()
    if ($foregroundForCopy -ne $targetHwnd) { Set-TestWindowForeground -WindowHandle $targetHwnd }
    else { break }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $clipboardDeadline)

  Set-Clipboard -Value 'kestrel-day2-clipboard-sentinel'
  Start-Sleep -Milliseconds 100
  [System.Windows.Forms.SendKeys]::SendWait('^a^c')
  $clipboardMatched = Wait-Until -TimeoutSeconds 3 -IntervalMilliseconds 100 -Condition {
    try {
      $value = Get-Clipboard -Raw -ErrorAction Stop
      return ($null -ne $value -and $value -ceq $expectedTranscript)
    } catch {
      return $false
    }
  }
  Check $clipboardMatched 'Ctrl+A / Ctrl+C in the target reads back the exact transcript'

  # Restore whatever the user had on the clipboard before the smoke ran.
  try {
    if ($hadClipboard) {
      Set-Clipboard -Value $previousClipboard -ErrorAction Stop
    } else {
      [System.Windows.Forms.Clipboard]::Clear()
    }
    Write-Host 'NOTE  Previous text clipboard restored.' -ForegroundColor DarkGray
  } catch {
    Write-Host "NOTE  Could not restore the previous clipboard: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  # 7. Tap test: Kestrel must still be hidden before the tap.
  $kestrelHiddenBeforeTap = -not [KestrelDay2Native]::IsWindowVisible($kestrelHwnd)
  Check $kestrelHiddenBeforeTap 'Kestrel is still hidden before the tap'
  $tapLogLineCount = @(Get-LogLines -Path $LogPath).Count
  Send-KestrelTap

  $tapOk = Wait-Until -TimeoutSeconds 5 -IntervalMilliseconds 100 -Condition {
    $lines = @(Get-LogLines -Path $LogPath)
    $tapSegmentText = ''
    if ($lines.Count -gt $tapLogLineCount) {
      $tapSegmentText = ($lines[$tapLogLineCount..($lines.Count - 1)] -join "`n")
    }
    $visible = [KestrelDay2Native]::IsWindowVisible($kestrelHwnd)
    $foreground = [KestrelDay2Native]::GetForegroundWindow() -eq $kestrelHwnd
    return ($visible -and $foreground -and ($tapSegmentText -match '\[hotkey\] focus=true'))
  }

  $kestrelVisibleAfterTap = [KestrelDay2Native]::IsWindowVisible($kestrelHwnd)
  $kestrelForegroundAfterTap = [KestrelDay2Native]::GetForegroundWindow() -eq $kestrelHwnd
  $tapSegment = @(Get-NewLogSegment -Path $LogPath -Skip $tapLogLineCount)
  $tapSegmentText = $tapSegment -join "`n"

  Check $kestrelVisibleAfterTap 'tap on the hotkey summons the hidden Kestrel window'
  Check $kestrelForegroundAfterTap 'summoned Kestrel window owns the foreground'
  Check ($tapSegmentText -match '\[hotkey\] focus=true') 'app log reports [hotkey] focus=true after the tap'
  if (-not $tapOk) {
    Write-Host 'DEBUG tap segment:' -ForegroundColor DarkYellow
    $tapSegment | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
  }

  # 8. Screenshot the summoned window so the dictation card shows the transcript.
  Start-Sleep -Milliseconds 500
  Save-WindowScreenshot -WindowHandle $kestrelHwnd -Path $ScreenshotPath
  $screenshot = Get-Item -LiteralPath $ScreenshotPath -ErrorAction SilentlyContinue
  Check ($null -ne $screenshot -and $screenshot.Length -gt 0) 'screenshot of the dictation card saved'

  # 9. Privacy checks.
  $audioExtensions = @('.webm', '.wav', '.opus', '.mp3', '.m4a', '.ogg', '.flac')
  $audioFiles = New-Object System.Collections.Generic.List[string]

  $userDataDirs = @(
    (Join-Path $env:APPDATA 'Kestrel'),
    (Join-Path $env:APPDATA 'kestrel'),
    (Join-Path $env:APPDATA '@kestrel')
  )
  foreach ($dir in $userDataDirs) {
    if (Test-Path -LiteralPath $dir) {
      Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
          $audioExtensions -contains $_.Extension.ToLowerInvariant() -and
          $_.LastWriteTime -ge $testStartedAt
        } |
        ForEach-Object { $audioFiles.Add($_.FullName) | Out-Null }
    }
  }
  $userDataAudio = @($audioFiles | Sort-Object -Unique)

  $tempAudio = @(
    Get-ChildItem -LiteralPath $env:TEMP -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -match '(?i)kestrel' -and
        $audioExtensions -contains $_.Extension.ToLowerInvariant() -and
        $_.LastWriteTime -ge $testStartedAt
      } |
      Select-Object -ExpandProperty FullName
  )

  $repoAudio = @(
    Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue |
      Where-Object {
        $audioExtensions -contains $_.Extension.ToLowerInvariant() -and
        $_.LastWriteTime -ge $testStartedAt
      } |
      Select-Object -ExpandProperty FullName
    Get-ChildItem -LiteralPath $desktopDir -File -ErrorAction SilentlyContinue |
      Where-Object {
        $audioExtensions -contains $_.Extension.ToLowerInvariant() -and
        $_.LastWriteTime -ge $testStartedAt
      } |
      Select-Object -ExpandProperty FullName
  )

  Check ($userDataAudio.Count -eq 0) "no audio files written under Kestrel userData directories ($(@($userDataAudio).Count) found)"
  Check ($tempAudio.Count -eq 0) "no Kestrel-named audio files written under %TEMP% ($(@($tempAudio).Count) found)"
  Check ($repoAudio.Count -eq 0) "no audio files written in the repo root or apps\desktop ($(@($repoAudio).Count) found)"
  if ($userDataAudio.Count -gt 0) { $userDataAudio | ForEach-Object { Write-Host "  audio: $_" -ForegroundColor Red } }
  if ($tempAudio.Count -gt 0) { $tempAudio | ForEach-Object { Write-Host "  audio: $_" -ForegroundColor Red } }
  if ($repoAudio.Count -gt 0) { $repoAudio | ForEach-Object { Write-Host "  audio: $_" -ForegroundColor Red } }

  $fullLog = Get-LogText -Path $LogPath
  $audioLinesMetadataOnly = $true
  foreach ($line in @(Get-LogLines -Path $LogPath)) {
    if ($line -match '\[dictation\] audio bytes=') {
      if ($line -notmatch '^\[dictation\] audio bytes=\d+ mime=[^\s]+$') {
        $audioLinesMetadataOnly = $false
      }
    }
  }
  $noAudioPayload = ($fullLog -notmatch '(?i)base64') -and
    ($fullLog -notmatch '(?i)data:audio/') -and
    ($fullLog -notmatch '[A-Za-z0-9+/]{200,}={0,2}')
  Check ($audioLinesMetadataOnly -and $noAudioPayload) 'app log contains byte counts only (no audio data or base64)'
} catch {
  $fatalMessage = $_.Exception.Message
  Write-Host "FAIL  $fatalMessage" -ForegroundColor Red
  $script:failures.Add($fatalMessage) | Out-Null
} finally {
  # Stop the target first, then the app tree, then the API tree. Logs and the
  # screenshot stay on disk even when a check failed.
  try { if ($target) { Stop-ProcessTree -Process $target } } catch { }
  try { if ($appLauncher) { Stop-ProcessTree -Process $appLauncher } } catch { }
  try { Stop-KestrelProcesses } catch { }
  try { if ($backendLauncher) { Stop-ProcessTree -Process $backendLauncher } } catch { }
  try { Stop-TestBackendProcesses } catch { }

  Remove-Item -LiteralPath $backendLauncherPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $appLauncherPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetScriptPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetOutputPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetErrorPath -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($script:failures.Count -eq 0) {
  Write-Host 'RESULT: PASS - Day 2 dictation, tap-to-summon, and privacy checks verified.' -ForegroundColor Green
  $exitCode = 0
} else {
  Write-Host "RESULT: FAIL - $($script:failures.Count) check(s) failed." -ForegroundColor Red
  $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  $exitCode = 1
}

if ($transcriptStarted) {
  try { Stop-Transcript | Out-Null } catch { }
}

exit $exitCode
