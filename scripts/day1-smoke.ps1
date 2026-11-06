#requires -Version 5.1
<#
  Day 1 smoke test for Kestrel.

  Verifies the only thing the Day 1 spike promises:
    1. the app opens,
    2. closing the window hides it to the tray,
    3. the global hotkey summons it while another app owns the foreground,
    4. the window (and its text input) really takes keyboard focus,
    5. the focus is reported as evidence in the proof log.

  Run from the repository root:
    powershell -ExecutionPolicy Bypass -File .\scripts\day1-smoke.ps1

  The script launches a production build, so run `npm run build` first.
#>
[CmdletBinding()]
param(
  [string]$LogPath,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$desktopDir = Join-Path $root 'apps\desktop'
$electronExe = Join-Path $root 'node_modules\electron\dist\electron.exe'

if (-not $LogPath) {
  $LogPath = Join-Path $root 'logs\day1-smoke.log'
}
if (-not $ScreenshotPath) {
  $ScreenshotPath = Join-Path $root 'logs\day1-window.png'
}
$LogPath = [IO.Path]::GetFullPath($LogPath)
$ScreenshotPath = [IO.Path]::GetFullPath($ScreenshotPath)

if (-not (Test-Path -LiteralPath $electronExe)) {
  throw "Electron is not installed at $electronExe. Run 'npm install' first."
}
if (-not (Test-Path -LiteralPath (Join-Path $desktopDir 'out\main\index.js'))) {
  throw "No production build found. Run 'npm run build' first."
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

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ScreenshotPath) | Out-Null
Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ScreenshotPath -Force -ErrorAction SilentlyContinue

Add-Type @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct KestrelRect {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public static class KestrelSmokeNative {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out KestrelRect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

[KestrelSmokeNative]::SetProcessDPIAware() | Out-Null

$script:failures = New-Object System.Collections.Generic.List[string]

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

function Set-TestWindowForeground {
  param([IntPtr]$WindowHandle)

  $foreground = [KestrelSmokeNative]::GetForegroundWindow()
  $foregroundPid = 0
  $foregroundThread = [KestrelSmokeNative]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  $targetPid = 0
  $targetThread = [KestrelSmokeNative]::GetWindowThreadProcessId($WindowHandle, [ref]$targetPid)

  # Windows refuses plain SetForegroundWindow calls from a background process.
  # Attach to the foreground thread so the test target can legitimately take focus.
  [KestrelSmokeNative]::ShowWindow($WindowHandle, 9) | Out-Null
  if ($foregroundThread -ne $targetThread) {
    [KestrelSmokeNative]::AttachThreadInput($foregroundThread, $targetThread, $true) | Out-Null
    [KestrelSmokeNative]::BringWindowToTop($WindowHandle) | Out-Null
    [KestrelSmokeNative]::SetForegroundWindow($WindowHandle) | Out-Null
    [KestrelSmokeNative]::SetActiveWindow($WindowHandle) | Out-Null
    [KestrelSmokeNative]::AttachThreadInput($foregroundThread, $targetThread, $false) | Out-Null
  } else {
    [KestrelSmokeNative]::SetForegroundWindow($WindowHandle) | Out-Null
  }

  Start-Sleep -Milliseconds 400
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

$script:hotkeyCodes = @($hotkey -split '\+' | ForEach-Object { Get-VirtualKeyCode $_ })

function Send-KestrelHotkey {
  # Uses the app's HOTKEY definition from apps/desktop/src/shared/types.ts.
  foreach ($code in $script:hotkeyCodes) {
    [KestrelSmokeNative]::keybd_event([byte]$code, 0, 0, [UIntPtr]::Zero)
  }
  Start-Sleep -Milliseconds 80

  $releaseCodes = @($script:hotkeyCodes)
  [array]::Reverse($releaseCodes)
  foreach ($code in $releaseCodes) {
    [KestrelSmokeNative]::keybd_event([byte]$code, 0, 2, [UIntPtr]::Zero)
  }
}

function Save-WindowScreenshot {
  param(
    [IntPtr]$WindowHandle,
    [string]$Path
  )

  $rect = New-Object KestrelRect
  if (-not [KestrelSmokeNative]::GetWindowRect($WindowHandle, [ref]$rect)) {
    Write-Host 'NOTE  Could not read the window rectangle; no screenshot saved.' -ForegroundColor Yellow
    return
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    Write-Host 'NOTE  Window has no drawable size; no screenshot saved.' -ForegroundColor Yellow
    return
  }

  Add-Type -AssemblyName System.Drawing
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  try {
    [KestrelSmokeNative]::PrintWindow($WindowHandle, $hdc, 2) | Out-Null
  } finally {
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Host "Screenshot: $Path" -ForegroundColor Cyan
}

# A stale instance would make the single-instance lock silently swallow the test launch.
Stop-KestrelProcesses
Start-Sleep -Milliseconds 500

Write-Host ''
Write-Host 'Kestrel Day 1 smoke test' -ForegroundColor Cyan
Write-Host "Log: $LogPath"

$launcherPath = Join-Path $env:TEMP 'kestrel-day1-smoke-launch.cmd'
@"
@echo off
cd /d "$desktopDir"
"$electronExe" . > "$LogPath" 2>&1
"@ | Set-Content -LiteralPath $launcherPath -Encoding ASCII

$launcher = $null
$target = $null
$kestrel = $null
$kestrelHwnd = [IntPtr]::Zero

try {
  $launcher = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', "`"$launcherPath`"" -WindowStyle Hidden -PassThru

  $kestrel = Wait-For -TimeoutSeconds 30 -FailureMessage 'Kestrel did not open a window within 30 seconds.' -Condition {
    Get-KestrelProcess
  }

  $kestrelHwnd = $kestrel.MainWindowHandle
  Write-Host "App pid=$($kestrel.Id) hwnd=$kestrelHwnd" -ForegroundColor DarkGray
  Check ([KestrelSmokeNative]::IsWindowVisible($kestrelHwnd)) 'app opens with a visible window'

  $logText = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
  Check ($logText -match "\[hotkey\] $hotkeyLogPattern registered=true") 'global hotkey registered'

  # Hide to tray, then put another real window in front.
  $null = $kestrel.CloseMainWindow()
  Start-Sleep -Milliseconds 1000
  Check (-not [KestrelSmokeNative]::IsWindowVisible($kestrelHwnd)) 'closing the window hides it to the tray'

  $targetScript = @'
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = "Kestrel Focus Target"
$form.Width = 460
$form.Height = 180
$form.StartPosition = "CenterScreen"
[System.Windows.Forms.Application]::Run($form)
'@
  # Hidden console: the form is the only visible window for the target, so the
  # test harness cannot reclaim focus through its own terminal window.
  $target = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoLogo', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $targetScript -PassThru

  $targetHwnd = Wait-For -TimeoutSeconds 15 -FailureMessage 'The background test window did not open.' -Condition {
    $target.Refresh()
    if ($target.MainWindowHandle -ne 0) { $target.MainWindowHandle } else { $null }
  }

  # Windows can refuse the first foreground change; retry briefly so this
  # setup check does not fail spuriously before the real test starts.
  $foregroundDeadline = (Get-Date).AddSeconds(5)
  do {
    Set-TestWindowForeground -WindowHandle $targetHwnd
    $foregroundBeforeHotkey = [KestrelSmokeNative]::GetForegroundWindow()
  } while ($foregroundBeforeHotkey -ne $targetHwnd -and (Get-Date) -lt $foregroundDeadline)

  if ($foregroundBeforeHotkey -ne $targetHwnd) {
    $foregroundPid = 0
    [KestrelSmokeNative]::GetWindowThreadProcessId($foregroundBeforeHotkey, [ref]$foregroundPid) | Out-Null
    $foregroundProcess = Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue
    Write-Host "DEBUG foreground before hotkey hwnd=$foregroundBeforeHotkey pid=$foregroundPid process=$($foregroundProcess.ProcessName) title=$($foregroundProcess.MainWindowTitle)" -ForegroundColor DarkYellow
  }
  Check ($foregroundBeforeHotkey -eq $targetHwnd) 'another app owns the foreground before the hotkey'

  Send-KestrelHotkey
  Start-Sleep -Milliseconds 1400

  Check ([KestrelSmokeNative]::IsWindowVisible($kestrelHwnd)) 'hotkey summons the hidden window'

  $foregroundAfterSummon = [KestrelSmokeNative]::GetForegroundWindow()
  if ($foregroundAfterSummon -ne $kestrelHwnd) {
    $foregroundPid = 0
    [KestrelSmokeNative]::GetWindowThreadProcessId($foregroundAfterSummon, [ref]$foregroundPid) | Out-Null
    $foregroundProcess = Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue
    Write-Host "DEBUG foreground hwnd=$foregroundAfterSummon pid=$foregroundPid process=$($foregroundProcess.ProcessName) title=$($foregroundProcess.MainWindowTitle)" -ForegroundColor DarkYellow
  }
  Check ($foregroundAfterSummon -eq $kestrelHwnd) 'summoned window owns the foreground'

  $logText = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
  Check ($logText -match '\[hotkey\] focus=true') 'main-process focus probe reports focus=true'

  # Type into whatever has keyboard focus, then copy it back. If the input
  # received the keystrokes, the clipboard contains exactly 'focus-ok'.
  Add-Type -AssemblyName System.Windows.Forms
  $previousClipboard = $null
  try {
    $previousClipboard = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  } catch {
    $previousClipboard = $null
  }

  [System.Windows.Forms.SendKeys]::SendWait('focus-ok')
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('^a^c')
  Start-Sleep -Milliseconds 400

  $typedValue = $null
  try {
    $typedValue = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  } catch {
    $typedValue = $null
  }

  if ($null -ne $typedValue) {
    Check ($typedValue.Trim() -eq 'focus-ok') 'keyboard input landed in the focused text field'
    [System.Windows.Forms.SendKeys]::SendWait('{RIGHT}')
    try {
      Set-Clipboard -Value $previousClipboard -ErrorAction SilentlyContinue
    } catch {
      # Clipboard is not part of the app under test.
    }
  } else {
    Write-Host 'NOTE  Could not read the clipboard; use the screenshot as evidence.' -ForegroundColor Yellow
  }

  Start-Sleep -Milliseconds 200
  Save-WindowScreenshot -WindowHandle $kestrelHwnd -Path $ScreenshotPath
} finally {
  if ($target -and -not $target.HasExited) {
    Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue
  }
  if ($launcher -and -not $launcher.HasExited) {
    & taskkill.exe /PID $launcher.Id /T /F 2>$null | Out-Null
  }
  Stop-KestrelProcesses
  Remove-Item -LiteralPath $launcherPath -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($script:failures.Count -eq 0) {
  Write-Host 'RESULT: PASS - Day 1 hotkey and focus behaviour verified.' -ForegroundColor Green
  exit 0
}

Write-Host "RESULT: FAIL - $($script:failures.Count) check(s) failed." -ForegroundColor Red
$script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
exit 1
