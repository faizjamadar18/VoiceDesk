#requires -Version 5.1
<#
  Notch push-to-talk smoke test for Kestrel.

  Uses fake ASR (no network, no model) and the real microphone. Proves:
    1. the app reserves the configured chord and starts the low-level hook,
    2. a tap under 300 ms shows no notch and starts no turn,
    3. a hold shows the notch without taking focus from the target app,
    4. live partials and the final transcript are produced locally,
    5. the final transcript reaches /act and a `type` action is pasted into
       the app that kept focus,
    6. Space never reaches the target while the chord is held,
    7. Esc cancels a live hold without calling /act,
    8. no audio file or audio payload is written or logged.

  Run from the repository root after `npm run build`:
    powershell -ExecutionPolicy Bypass -File .\scripts\notch-smoke.ps1
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
$notchHtml = Join-Path $desktopDir 'out\renderer\notch.html'

$testPort = 8791
$expectedSpoken = 'type Kestrel notch smoke 4821.'
$expectedTyped = 'Kestrel notch smoke 4821.'
$notchTitle = 'Kestrel Notch'
$testStartedAt = Get-Date

if (-not $LogPath) { $LogPath = Join-Path $logsDir 'notch-smoke.log' }
if (-not $ConsoleLogPath) { $ConsoleLogPath = Join-Path $logsDir 'notch-smoke-console.log' }
if (-not $ApiLogPath) { $ApiLogPath = Join-Path $logsDir 'notch-api.log' }
if (-not $ScreenshotPath) { $ScreenshotPath = Join-Path $logsDir 'notch-window.png' }
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
if (-not (Test-Path -LiteralPath $notchHtml)) {
  throw "The notch renderer is missing at $notchHtml. Run 'npm run build' first."
}
if (-not (Test-Path -LiteralPath $apiPython)) {
  throw "The API virtualenv is missing at $apiPython. Create it and install requirements-dev.txt."
}

$sharedTypesPath = Join-Path $desktopDir 'src\shared\types.ts'
$sharedTypes = Get-Content -LiteralPath $sharedTypesPath -Raw
$hotkeyMatch = [regex]::Match($sharedTypes, "export const DEFAULT_HOTKEY = '([^']+)'")
if (-not $hotkeyMatch.Success) {
  $hotkeyMatch = [regex]::Match($sharedTypes, "export const HOTKEY = '([^']+)'")
}
if (-not $hotkeyMatch.Success) {
  throw "Could not read the default hotkey from $sharedTypesPath."
}
$hotkey = $hotkeyMatch.Groups[1].Value

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
foreach ($path in @($LogPath, $ConsoleLogPath, $ApiLogPath, $ScreenshotPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
  Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
}

$script:failures = New-Object System.Collections.Generic.List[string]

$transcriptStarted = $false
try {
  Start-Transcript -Path $ConsoleLogPath -Force | Out-Null
  $transcriptStarted = $true
} catch {
  Write-Host "WARN  Could not start the console transcript: $($_.Exception.Message)" -ForegroundColor Yellow
}

# --- Native helpers --------------------------------------------------------

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct KestrelNotchRect {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public static class KestrelNotchNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out KestrelNotchRect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

[KestrelNotchNative]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Check {
  param([bool]$Condition, [string]$Message)
  if ($Condition) {
    Write-Host "PASS  $Message" -ForegroundColor Green
  } else {
    Write-Host "FAIL  $Message" -ForegroundColor Red
    $script:failures.Add($Message) | Out-Null
  }
}

function Wait-For {
  param([scriptblock]$Condition, [int]$TimeoutSeconds, [string]$FailureMessage)
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

function Get-LogText {
  param([string]$Path)
  $text = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $text) { return '' }
  return $text
}

function Get-NewLogSegment {
  param([string]$Path, [int]$Skip)
  $lines = @(Get-LogLines -Path $Path)
  if ($Skip -ge $lines.Count) { return @() }
  return @($lines[$Skip..($lines.Count - 1)])
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
  }
}

function Set-TestWindowForeground {
  param([IntPtr]$WindowHandle)

  $foreground = [KestrelNotchNative]::GetForegroundWindow()
  $foregroundPid = 0
  $foregroundThread = [KestrelNotchNative]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  $targetPid = 0
  $targetThread = [KestrelNotchNative]::GetWindowThreadProcessId($WindowHandle, [ref]$targetPid)

  [KestrelNotchNative]::ShowWindow($WindowHandle, 9) | Out-Null
  if ($foregroundThread -ne $targetThread) {
    [KestrelNotchNative]::AttachThreadInput($foregroundThread, $targetThread, $true) | Out-Null
    [KestrelNotchNative]::BringWindowToTop($WindowHandle) | Out-Null
    [KestrelNotchNative]::SetForegroundWindow($WindowHandle) | Out-Null
    [KestrelNotchNative]::SetActiveWindow($WindowHandle) | Out-Null
    [KestrelNotchNative]::AttachThreadInput($foregroundThread, $targetThread, $false) | Out-Null
  } else {
    [KestrelNotchNative]::SetForegroundWindow($WindowHandle) | Out-Null
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
    'meta' { return 0x5B }
    'win' { return 0x5B }
    'space' { return 0x20 }
    'escape' { return 0x1B }
    'esc' { return 0x1B }
    default {
      if ($Key -match '^F([1-9]|1[0-2])$') {
        return 0x70 + ([int]$Key.Substring(1) - 1)
      }
      if ($Key.Length -eq 1 -and $Key -match '^[A-Za-z0-9]$') {
        return [int][char]$Key.ToUpperInvariant()
      }
      throw "Unsupported key '$Key' in the configured hotkey."
    }
  }
}

$script:hotkeyCodes = @($hotkey -split '\+' | ForEach-Object { Get-VirtualKeyCode $_ })

function Send-KestrelChordDown {
  foreach ($code in $script:hotkeyCodes) {
    [KestrelNotchNative]::keybd_event([byte]$code, 0, 0, [UIntPtr]::Zero)
  }
}

function Send-KestrelChordUp {
  $releaseCodes = @($script:hotkeyCodes)
  [array]::Reverse($releaseCodes)
  foreach ($code in $releaseCodes) {
    [KestrelNotchNative]::keybd_event([byte]$code, 0, 2, [UIntPtr]::Zero)
  }
}

function Send-KestrelTap {
  Send-KestrelChordDown
  Start-Sleep -Milliseconds 60
  Send-KestrelChordUp
}

function Send-Escape {
  [KestrelNotchNative]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [KestrelNotchNative]::keybd_event(0x1B, 0, 2, [UIntPtr]::Zero)
}

function Get-WindowHandleByTitle {
  param([string]$Title)

  $script:windowTitleTarget = $Title
  $script:windowTitleHandle = [IntPtr]::Zero
  $callback = [KestrelNotchNative+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    $length = [KestrelNotchNative]::GetWindowTextLength($hWnd)
    if ($length -gt 0) {
      $builder = New-Object System.Text.StringBuilder ($length + 1)
      [KestrelNotchNative]::GetWindowText($hWnd, $builder, $builder.Capacity) | Out-Null
      if ($builder.ToString() -eq $script:windowTitleTarget) {
        $script:windowTitleHandle = $hWnd
        return $false
      }
    }
    return $true
  }

  [KestrelNotchNative]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  return $script:windowTitleHandle
}

function Get-NotchHandle {
  return Get-WindowHandleByTitle -Title $notchTitle
}

function Test-NotchVisible {
  $handle = Get-NotchHandle
  return ($handle -ne [IntPtr]::Zero) -and [KestrelNotchNative]::IsWindowVisible($handle)
}

function Read-TargetText {
  param([string]$Path)
  try {
    if (Test-Path -LiteralPath $Path) {
      return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
    }
  } catch {
  }
  return $null
}

function Save-WindowScreenshot {
  param([IntPtr]$WindowHandle, [string]$Path)

  $rect = New-Object KestrelNotchRect
  if (-not [KestrelNotchNative]::GetWindowRect($WindowHandle, [ref]$rect)) {
    Write-Host 'NOTE  Could not read the notch rectangle; no screenshot saved.' -ForegroundColor Yellow
    return
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    Write-Host 'NOTE  The notch has no drawable size; no screenshot saved.' -ForegroundColor Yellow
    return
  }

  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  try {
    [KestrelNotchNative]::PrintWindow($WindowHandle, $hdc, 2) | Out-Null
  } finally {
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Host "Screenshot: $Path" -ForegroundColor Cyan
}

# --- Test body -------------------------------------------------------------

$backendLauncherPath = Join-Path $env:TEMP ("kestrel-notch-api-" + [Guid]::NewGuid().ToString('N') + '.cmd')
$appLauncherPath = Join-Path $env:TEMP ("kestrel-notch-app-" + [Guid]::NewGuid().ToString('N') + '.cmd')
$targetScriptPath = Join-Path $env:TEMP ("kestrel-notch-target-" + [Guid]::NewGuid().ToString('N') + '.ps1')
$targetOutputPath = Join-Path $env:TEMP ("kestrel-notch-text-" + [Guid]::NewGuid().ToString('N') + '.txt')
$targetKeyLogPath = Join-Path $env:TEMP ("kestrel-notch-keys-" + [Guid]::NewGuid().ToString('N') + '.txt')
$targetErrorPath = Join-Path $env:TEMP ("kestrel-notch-target-error-" + [Guid]::NewGuid().ToString('N') + '.txt')
$settingsPath = Join-Path $env:TEMP ("kestrel-notch-settings-" + [Guid]::NewGuid().ToString('N') + '.json')

$backendLauncher = $null
$appLauncher = $null
$kestrel = $null
$target = $null
$kestrelHwnd = [IntPtr]::Zero
$previousClipboard = $null
$hadClipboard = $false

try {
  try { $previousClipboard = Get-Clipboard -Raw -ErrorAction Stop } catch { $previousClipboard = $null }
  $hadClipboard = $null -ne $previousClipboard

  Stop-KestrelProcesses
  Stop-TestBackendProcesses
  $portDeadline = (Get-Date).AddSeconds(5)
  while ((Get-PortListenerPid -Port $testPort) -and (Get-Date) -lt $portDeadline) {
    Start-Sleep -Milliseconds 200
  }
  $portOwner = Get-PortListenerPid -Port $testPort
  if ($portOwner) {
    throw "Port $testPort is already in use by PID $portOwner. Stop that process and re-run."
  }
  Start-Sleep -Milliseconds 500

  Write-Host ''
  Write-Host 'Kestrel notch push-to-talk smoke test' -ForegroundColor Cyan
  Write-Host "Log: $LogPath"
  Write-Host "API log: $ApiLogPath"
  Write-Host "Console log: $ConsoleLogPath"
  Write-Host "Hotkey: $hotkey"
  Write-Host "Fake transcript: $expectedSpoken"
  Write-Host ''

  # 1. Local API on a test-only port, with action execution disabled.
  @"
@echo off
cd /d "$apiDir"
set "KESTREL_ASR_PROVIDER=fake"
set "KESTREL_FAKE_TRANSCRIPT=$expectedSpoken"
set "KESTREL_ACTION_DRY_RUN=1"
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

  # 2. Built app with fake ASR and an isolated settings file.
  @"
@echo off
cd /d "$desktopDir"
set "KESTREL_API_URL=http://127.0.0.1:$testPort"
set "KESTREL_ASR_MODE=fake"
set "KESTREL_FAKE_TRANSCRIPT=$expectedSpoken"
set "KESTREL_SETTINGS_PATH=$settingsPath"
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
  Check ([KestrelNotchNative]::IsWindowVisible($kestrelHwnd)) 'app opens with a visible window on first run'

  $ready = Wait-Until -TimeoutSeconds 30 -IntervalMilliseconds 250 -Condition {
    $text = Get-LogText -Path $LogPath
    ($text -match '\[hotkey\].*registered=true') -and
    ($text -match '\[hotkey\] hook started for ') -and
    ($text -match '\[asr\] fake transcriber ready')
  }
  $readyLog = Get-LogText -Path $LogPath
  Check ($readyLog -match '\[hotkey\].*registered=true') "global hotkey registered ($hotkey)"
  Check ($readyLog -match '\[hotkey\] hook started for ') 'low-level push-to-talk hook started'
  Check ($readyLog -match '\[asr\] fake transcriber ready') 'fake local transcriber is ready (no model or network)'
  if (-not $ready) {
    $tail = (Get-Content -LiteralPath $LogPath -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
    throw "Kestrel did not become ready.`n$tail"
  }

  # 3. Hide the main window. The notch stays preloaded and hidden.
  $null = $kestrel.CloseMainWindow()
  $hidden = Wait-Until -TimeoutSeconds 5 -IntervalMilliseconds 200 -Condition {
    -not [KestrelNotchNative]::IsWindowVisible($kestrelHwnd)
  }
  Check $hidden 'closing the window hides it to the tray'
  if (-not $hidden) { throw 'Could not hide the Kestrel window; focus checks would be invalid.' }

  # 4. Separate WinForms target with a focused TextBox and a key log.
  $targetScript = @'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:outputPath = '__OUTPUT_PATH__'
$script:keyLogPath = '__KEYLOG_PATH__'
$script:utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList @($false)
[System.IO.File]::WriteAllText($script:outputPath, '', $script:utf8)
[System.IO.File]::WriteAllText($script:keyLogPath, '', $script:utf8)

$script:form = New-Object System.Windows.Forms.Form
$script:form.Text = 'Kestrel Notch Target'
$script:form.Width = 720
$script:form.Height = 420
$script:form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen

$script:textBox = New-Object System.Windows.Forms.TextBox
$script:textBox.Multiline = $true
$script:textBox.Dock = [System.Windows.Forms.DockStyle]::Fill
$script:textBox.AcceptsReturn = $true
$script:textBox.AcceptsTab = $true
$script:textBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$script:textBox.Add_KeyDown({
  param($sender, $eventArgs)
  try {
    [System.IO.File]::AppendAllText(
      $script:keyLogPath,
      ([int]$eventArgs.KeyCode).ToString() + "`n",
      $script:utf8
    )
  } catch {
  }
})
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

$script:timer.Start()
[System.Windows.Forms.Application]::Run($script:form)
'@
  $targetScript = $targetScript.Replace('__OUTPUT_PATH__', $targetOutputPath.Replace("'", "''"))
  $targetScript = $targetScript.Replace('__KEYLOG_PATH__', $targetKeyLogPath.Replace("'", "''"))
  Set-Content -LiteralPath $targetScriptPath -Value $targetScript -Encoding ASCII

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

  $foregroundDeadline = (Get-Date).AddSeconds(5)
  do {
    Set-TestWindowForeground -WindowHandle $targetHwnd
    $foregroundBefore = [KestrelNotchNative]::GetForegroundWindow()
  } while ($foregroundBefore -ne $targetHwnd -and (Get-Date) -lt $foregroundDeadline)
  Check ($foregroundBefore -eq $targetHwnd) 'target app owns the foreground before the test'
  if ($foregroundBefore -ne $targetHwnd) {
    throw 'Could not give the target app foreground; refusing to send the hotkey.'
  }

  # 5. Prove the target's key log works before checking that Space is blocked.
  [System.Windows.Forms.SendKeys]::SendWait('a')
  $keyLogWorks = Wait-Until -TimeoutSeconds 3 -IntervalMilliseconds 100 -Condition {
    $text = Get-LogText -Path $targetKeyLogPath
    return $text -match '(?m)^65$'
  }
  Check $keyLogWorks 'target receives ordinary keystrokes (key-log sanity check)'
  [System.IO.File]::WriteAllText($targetKeyLogPath, '', [Text.Encoding]::UTF8)
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
  $cleared = Wait-Until -TimeoutSeconds 3 -IntervalMilliseconds 100 -Condition {
    $text = Read-TargetText -Path $targetOutputPath
    return $text -eq ''
  }
  Check $cleared 'target field is empty before the turn'

  # 6. A tap under 300 ms must do nothing.
  $tapLogSkip = @(Get-LogLines -Path $LogPath).Count
  Send-KestrelTap
  Start-Sleep -Milliseconds 900
  $tapSegmentText = (@(Get-NewLogSegment -Path $LogPath -Skip $tapLogSkip) -join "`n")
  $notchVisibleAfterTap = Test-NotchVisible
  $foregroundAfterTap = [KestrelNotchNative]::GetForegroundWindow()
  Check (-not $notchVisibleAfterTap) 'tap under 0.3 s does not show the notch'
  Check ($tapSegmentText -notmatch '\[notch\] start') 'tap under 0.3 s starts no recording session'
  Check ($foregroundAfterTap -eq $targetHwnd) 'tap under 0.3 s does not take focus'

  # 7. Hold test.
  $holdLogSkip = @(Get-LogLines -Path $LogPath).Count
  [System.IO.File]::WriteAllText($targetKeyLogPath, '', [Text.Encoding]::UTF8)

  Send-KestrelChordDown
  Start-Sleep -Milliseconds 850

  $notchDuringHold = Get-NotchHandle
  $notchVisibleDuringHold = ($notchDuringHold -ne [IntPtr]::Zero) -and [KestrelNotchNative]::IsWindowVisible($notchDuringHold)
  $foregroundDuringHold = [KestrelNotchNative]::GetForegroundWindow()
  $mainVisibleDuringHold = [KestrelNotchNative]::IsWindowVisible($kestrelHwnd)
  if ($notchVisibleDuringHold) {
    Save-WindowScreenshot -WindowHandle $notchDuringHold -Path $ScreenshotPath
  }

  Start-Sleep -Milliseconds 850
  $keyupWatch = [Diagnostics.Stopwatch]::StartNew()
  Send-KestrelChordUp
  $foregroundAfterKeyup = [KestrelNotchNative]::GetForegroundWindow()
  $notchVisibleAfterKeyup = Test-NotchVisible

  $textMatched = $false
  $currentTargetText = $null
  $textDeadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $textDeadline) {
    $currentTargetText = Read-TargetText -Path $targetOutputPath
    if ($currentTargetText -ceq $expectedTyped) {
      $textMatched = $true
      break
    }
    Start-Sleep -Milliseconds 50
  }
  $keyupWatch.Stop()
  $keyupToPasteMs = [int]$keyupWatch.ElapsedMilliseconds

  Check $notchVisibleDuringHold 'notch appears during a hold longer than 0.3 s'
  Check ($foregroundDuringHold -eq $targetHwnd) 'notch did not steal focus while visible'
  Check (-not $mainVisibleDuringHold) 'main window stayed hidden during the hold'
  Check ($notchDuringHold -ne $foregroundDuringHold) 'notch window was never the foreground window'
  Check $notchVisibleAfterKeyup 'notch stays visible for the processing/result state'
  Check ($foregroundAfterKeyup -eq $targetHwnd) 'target app still owns the foreground after keyup'

  if ($textMatched) {
    Check $true ("typed action pasted the exact transcript (keyup-to-paste {0} ms)" -f $keyupToPasteMs)
    Write-Host ("MEASURE  keyup-to-paste {0} ms" -f $keyupToPasteMs) -ForegroundColor Cyan
  } else {
    $shown = if ($null -eq $currentTargetText) { '<none>' } else { $currentTargetText }
    Check $false ("target text did not match (saw: '{0}')" -f $shown)
  }

  $resultLogged = Wait-Until -TimeoutSeconds 5 -IntervalMilliseconds 100 -Condition {
    (Get-LogText -Path $LogPath) -match '\[notch\] result phase=result'
  }
  $holdSegmentText = (@(Get-NewLogSegment -Path $LogPath -Skip $holdLogSkip) -join "`n")

  Check $resultLogged 'notch logs a successful result'
  Check ($holdSegmentText -match '\[ptt\] listening') 'push-to-talk reached the listening phase'
  Check ($holdSegmentText -match '\[notch\] start session=\d+') 'notch session started'
  Check ($holdSegmentText -match '\[notch\] partial chars=\d+') 'live partial transcript was produced'
  $stopMatch = [regex]::Match($holdSegmentText, '\[ptt\] stop holdMs=(\d+)')
  $holdMs = if ($stopMatch.Success) { [int]$stopMatch.Groups[1].Value } else { -1 }
  Check ($stopMatch.Success -and $holdMs -ge 300) ("push-to-talk recorded a hold of at least 300 ms (holdMs={0})" -f $holdMs)

  $audioMatch = [regex]::Match($holdSegmentText, '\[notch\] stop samples=(\d+) rate=(\d+)')
  $sampleCount = if ($audioMatch.Success) { [int64]$audioMatch.Groups[1].Value } else { 0 }
  Check ($audioMatch.Success -and $sampleCount -gt 0) ("in-memory audio reached the controller (samples={0})" -f $sampleCount)
  Check ($holdSegmentText -match '\[notch\] final chars=\d+') 'final local transcript was produced'
  Check ($holdSegmentText -match '\[notch\] action status=ok action=type dryRun=true') '/act returned a dry-run type action'
  Check ($holdSegmentText -notmatch '\[notch\] error') 'no notch error was logged'

  $keyLogText = Get-LogText -Path $targetKeyLogPath
  $spaceLines = @($keyLogText -split "`r?`n" | Where-Object { $_ -eq '32' })
  Check ($spaceLines.Count -eq 0) 'Space keydown never reached the target app during the hold'

  $notchHiddenAfterResult = Wait-Until -TimeoutSeconds 6 -IntervalMilliseconds 100 -Condition {
    -not (Test-NotchVisible)
  }
  Check $notchHiddenAfterResult 'notch hides itself after showing the result'

  # 8. Escape cancels a live hold without transcribing or acting.
  $cancelLogSkip = @(Get-LogLines -Path $LogPath).Count
  Send-KestrelChordDown
  Start-Sleep -Milliseconds 700
  $notchVisibleBeforeCancel = Test-NotchVisible
  Send-Escape
  Start-Sleep -Milliseconds 60
  Send-KestrelChordUp
  $notchHiddenAfterCancel = Wait-Until -TimeoutSeconds 3 -IntervalMilliseconds 100 -Condition {
    -not (Test-NotchVisible)
  }
  $cancelSegmentText = (@(Get-NewLogSegment -Path $LogPath -Skip $cancelLogSkip) -join "`n")

  Check $notchVisibleBeforeCancel 'notch appears before Escape is pressed'
  Check $notchHiddenAfterCancel 'Esc hides the notch immediately'
  Check ($cancelSegmentText -match '\[notch\] cancel session=\d+') 'Esc cancelled the live session'
  Check ($cancelSegmentText -notmatch '\[notch\] final') 'cancelled hold never produced a final transcript or action'

  # 9. The API executed the planned action in dry-run mode.
  $apiLogText = Get-LogText -Path $ApiLogPath
  Check ($apiLogText -match '\[act\] status=ok action=type dryRun=True') 'API log shows the dry-run type action'

  # 10. Privacy checks.
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

  Check ($userDataAudio.Count -eq 0) 'no audio files under Kestrel userData directories'
  Check ($tempAudio.Count -eq 0) 'no Kestrel-named audio files under %TEMP%'
  Check ($repoAudio.Count -eq 0) 'no audio files in the repo root or apps\desktop'

  $fullLog = Get-LogText -Path $LogPath
  $noAudioPayload = ($fullLog -notmatch '(?i)base64') -and
    ($fullLog -notmatch '(?i)data:audio/') -and
    ($fullLog -notmatch '[A-Za-z0-9+/]{200,}={0,2}')
  Check $noAudioPayload 'app log contains no audio payload or base64 data'

  $screenshot = Get-Item -LiteralPath $ScreenshotPath -ErrorAction SilentlyContinue
  Check ($null -ne $screenshot -and $screenshot.Length -gt 0) 'notch screenshot saved'

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
} catch {
  $fatalMessage = $_.Exception.Message
  Write-Host "FAIL  $fatalMessage" -ForegroundColor Red
  $script:failures.Add($fatalMessage) | Out-Null
} finally {
  try { if ($target) { Stop-ProcessTree -Process $target } } catch { }
  try { if ($appLauncher) { Stop-ProcessTree -Process $appLauncher } } catch { }
  try { Stop-KestrelProcesses } catch { }
  try { if ($backendLauncher) { Stop-ProcessTree -Process $backendLauncher } } catch { }
  try { Stop-TestBackendProcesses } catch { }

  Remove-Item -LiteralPath $backendLauncherPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $appLauncherPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetScriptPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetOutputPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetKeyLogPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $targetErrorPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $settingsPath -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($script:failures.Count -eq 0) {
  Write-Host 'RESULT: PASS - notch push-to-talk, tap gate, key blocking, Esc cancel, and privacy verified.' -ForegroundColor Green
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
