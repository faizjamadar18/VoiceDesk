import { useState } from 'react'
import type { JSX } from 'react'
import { AppleSwitch } from '../agent/AppleSwitch'
import { Card } from './Card'
import { KeyTile } from './KeyTile'
import {
  AISparkleIcon,
  ClipboardPasteIcon,
  CloseIcon,
  EyeOffIcon,
  GlobeIcon,
  HandIcon,
  LogInIcon,
  MicIcon,
  MinusIcon,
  ShieldIcon,
  SideNotchIcon,
  SparklesIcon,
  Volume2Icon,
  VolumeXIcon
} from './icons'

export function GeneralSettingsTab({
  isDarkMode = true
}: {
  isDarkMode?: boolean
}): JSX.Element {
  // Shortcut states
  const [dictationDoubleTap, setDictationDoubleTap] = useState(false)
  const [agentDoubleTap, setAgentDoubleTap] = useState(false)

  // General options
  const [launchAtLogin, setLaunchAtLogin] = useState(true)
  const [startInBackground, setStartInBackground] = useState(false)
  const [closeToTray, setCloseToTray] = useState(true)
  const [contextAwareness, setContextAwareness] = useState(true)
  const [privateMode, setPrivateMode] = useState(false)

  // Visibility options
  const [dictationPill, setDictationPill] = useState(false)
  const [hideSideNotch, setHideSideNotch] = useState(false)
  const [hideTopNotch, setHideTopNotch] = useState(false)

  // Audio options
  const [selectedMic, setSelectedMic] = useState('Auto select')
  const [interactionSounds, setInteractionSounds] = useState(true)
  const [muteWhenDictating, setMuteWhenDictating] = useState(true)

  // Extras
  const [creatorMode, setCreatorMode] = useState(false)

  return (
    <div className="voiceos-tab-content space-y-8">
      {/* 1. Shortcuts Section */}
      <div className="voiceos-settings-section">
        <h3 className="voiceos-section-header">Shortcuts</h3>

        {/* Card 1: Agent Mode */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <AISparkleIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Agent Mode</h3>
                <p className="voiceos-row-desc">Ask AI to do things in Slack, Gmail, and more</p>
              </div>
            </div>
            <div className="voiceos-setting-controls">
              <div className="settings-keys-group">
                <KeyTile label="Alt" sublabel="alt" />
                <KeyTile label="Ctrl" sublabel="control" />
              </div>
              <button type="button" className="voiceos-change-btn">
                Change
              </button>
            </div>
          </div>
        </Card>

        {/* Card 2: Dictation Mode */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <MicIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Dictation Mode</h3>
                <p className="voiceos-row-desc">Hold to dictate</p>
              </div>
            </div>
            <div className="voiceos-setting-controls">
              <div className="settings-keys-group">
                <KeyTile label="Ctrl" sublabel="control" />
                <KeyTile label="⇧" sublabel="shift" />
              </div>
              <button type="button" className="voiceos-change-btn">
                Change
              </button>
            </div>
          </div>
        </Card>

        {/* Card 3: Hands-Free Dictation */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row items-start">
            <div className="voiceos-setting-copy flex items-start gap-2">
              <HandIcon size={20} className="text-gray-300 mt-0.5" />
              <div>
                <h3 className="voiceos-row-title">Hands-Free Dictation</h3>
                <p className="voiceos-row-desc">
                  Use either option to start and stop without holding a key
                </p>
              </div>
            </div>
            <div className="voiceos-hands-free-container">
              {/* Option 1: Double tap */}
              <div className="voiceos-option-tile">
                <div className="voiceos-option-info">
                  <span className="voiceos-option-title">Double tap</span>
                  <span className="voiceos-option-subtitle">Uses your Dictation shortcut</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="settings-keys-group">
                    <KeyTile label="Ctrl" sublabel="control" />
                    <KeyTile label="⇧" sublabel="shift" />
                  </div>
                  <AppleSwitch
                    checked={dictationDoubleTap}
                    onToggle={() => setDictationDoubleTap((prev) => !prev)}
                    label="Hands-Free Dictation: Double tap"
                  />
                </div>
              </div>

              {/* Option 2: Press once */}
              <div className="voiceos-option-tile">
                <div className="voiceos-option-info">
                  <span className="voiceos-option-title">Press once</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="settings-keys-group">
                    <KeyTile label="Ctrl" sublabel="control" />
                    <KeyTile label="⇧" sublabel="shift" />
                    <KeyTile label="space" sublabel="space" />
                  </div>
                  <button type="button" className="voiceos-change-btn">
                    Change
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 4: Hands-Free Agent */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row items-start">
            <div className="voiceos-setting-copy flex items-start gap-2">
              <HandIcon size={20} className="text-gray-300 mt-0.5" />
              <div>
                <h3 className="voiceos-row-title">Hands-Free Agent</h3>
                <p className="voiceos-row-desc">
                  Double-tap your Agent shortcut to speak without holding a key
                </p>
              </div>
            </div>
            <div className="voiceos-hands-free-container">
              <div className="voiceos-option-tile">
                <div className="voiceos-option-info">
                  <span className="voiceos-option-title">Double tap</span>
                  <span className="voiceos-option-subtitle">Uses your Agent shortcut</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="settings-keys-group">
                    <KeyTile label="Alt" sublabel="alt" />
                    <KeyTile label="Ctrl" sublabel="control" />
                  </div>
                  <AppleSwitch
                    checked={agentDoubleTap}
                    onToggle={() => setAgentDoubleTap((prev) => !prev)}
                    label="Hands-Free Agent: Double tap"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 5: Paste Last Transcript */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <ClipboardPasteIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Paste Last Transcript</h3>
                <p className="voiceos-row-desc">Press to paste your most recent dictation</p>
              </div>
            </div>
            <div className="voiceos-setting-controls">
              <div className="settings-keys-group">
                <KeyTile label="Ctrl" sublabel="control" />
                <KeyTile label="⇧" sublabel="shift" />
                <KeyTile label="V" sublabel="v" />
              </div>
              <button type="button" className="voiceos-change-btn">
                Change
              </button>
            </div>
          </div>
        </Card>

        {/* Card 6: Open sidebar */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <SideNotchIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Open sidebar</h3>
                <p className="voiceos-row-desc">
                  Hold the modifier keys and tap the shortcut to open. Use ↑/↓ or tap again to switch tasks; release to select.
                </p>
              </div>
            </div>
            <div className="voiceos-setting-controls">
              <div className="settings-keys-group">
                <KeyTile label="Ctrl" sublabel="control" />
                <KeyTile label="Space" sublabel="space" />
              </div>
              <button type="button" className="voiceos-change-btn">
                Change
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* 2. General Section */}
      <div className="voiceos-settings-section">
        <h3 className="voiceos-section-header">General</h3>

        {/* Languages */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <GlobeIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Languages</h3>
                <p className="voiceos-row-desc">
                  Select the languages for dictation. VoiceOS will automatically detect.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="voiceos-language-badge">
                <span>English (US)</span>
                <span className="voiceos-primary-pill">Primary</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Launch at Login with Windows nested background option */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div>
            <div className="voiceos-setting-row">
              <div className="voiceos-setting-copy flex items-center gap-2">
                <LogInIcon size={20} className="text-gray-300" />
                <div>
                  <h3 className="voiceos-row-title">Launch at Login</h3>
                  <p className="voiceos-row-desc">Open VoiceOS automatically when your computer starts.</p>
                </div>
              </div>
              <AppleSwitch
                checked={launchAtLogin}
                onToggle={() => setLaunchAtLogin((prev) => !prev)}
                label="Launch at Login"
              />
            </div>

            {/* Nested Windows startInBackground */}
            <div className={`voiceos-nested-subrow ${launchAtLogin ? '' : 'opacity-50'}`}>
              <div className="voiceos-setting-copy">
                <h4 className="voiceos-row-title">Start in background</h4>
                <p className="voiceos-row-desc">
                  Keep the window hidden at startup. Open VoiceOS from the system tray.
                </p>
              </div>
              <AppleSwitch
                checked={startInBackground}
                disabled={!launchAtLogin}
                onToggle={() => setStartInBackground((prev) => !prev)}
                label="Start in background"
              />
            </div>
          </div>
        </Card>

        {/* Close to tray */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <CloseIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Close to tray</h3>
                <p className="voiceos-row-desc">
                  Minimize to system tray instead of quitting when you close the window.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={closeToTray}
              onToggle={() => setCloseToTray((prev) => !prev)}
              label="Close to tray"
            />
          </div>
        </Card>

        {/* Context Awareness */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <SparklesIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Context Awareness</h3>
                <p className="voiceos-row-desc">
                  Use limited text content from the app to spell names correctly
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={contextAwareness}
              onToggle={() => setContextAwareness((prev) => !prev)}
              label="Context Awareness"
            />
          </div>
        </Card>

        {/* Private Mode */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <ShieldIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Private mode</h3>
                <p className="voiceos-row-desc">
                  If enabled, none of your dictation data will be stored or used for model training by us or any third party.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={privateMode}
              onToggle={() => setPrivateMode((prev) => !prev)}
              label="Private mode"
            />
          </div>
        </Card>
      </div>

      {/* 3. Visibility Section */}
      <div className="voiceos-settings-section">
        <h3 className="voiceos-section-header">Visibility</h3>

        {/* Hide dictation pill */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <EyeOffIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Hide dictation pill</h3>
                <p className="voiceos-row-desc">
                  Only show the pill while you&apos;re dictating, not all the time.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={dictationPill}
              onToggle={() => setDictationPill((prev) => !prev)}
              label="Hide dictation pill"
            />
          </div>
        </Card>

        {/* Hide side notch when minimized */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <SideNotchIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Hide side notch when minimized</h3>
                <p className="voiceos-row-desc">
                  Hide the side notch and let clicks pass through. Turn this off to restore it.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={hideSideNotch}
              onToggle={() => setHideSideNotch((prev) => !prev)}
              label="Hide side notch when minimized"
            />
          </div>
        </Card>

        {/* Hide top notch */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <MinusIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Hide top notch</h3>
                <p className="voiceos-row-desc">
                  No notch, hover effect, or haptic at the top of the screen. Click where it sits to open it.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={hideTopNotch}
              onToggle={() => setHideTopNotch((prev) => !prev)}
              label="Hide top notch"
            />
          </div>
        </Card>
      </div>

      {/* 4. Audio & Speech Section */}
      <div className="voiceos-settings-section">
        <h3 className="voiceos-section-header">Audio & Speech</h3>

        {/* Select default microphone */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <MicIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Select default microphone</h3>
                <p className="voiceos-row-desc">Select the microphone VoiceOS will use by default.</p>
              </div>
            </div>
            <div className="voiceos-select-wrapper">
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="voiceos-select"
              >
                <option value="Auto select">Auto select</option>
                <option value="Default - Microphone Array">Default - Microphone Array</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Interaction sounds */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <Volume2Icon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Interaction sounds</h3>
                <p className="voiceos-row-desc">
                  Play a sound when VoiceOS starts and stops recording.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={interactionSounds}
              onToggle={() => setInteractionSounds((prev) => !prev)}
              label="Interaction sounds"
            />
          </div>
        </Card>

        {/* Lower media volume while talking */}
        <Card isDarkMode={isDarkMode} className="p-5 mt-4">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <VolumeXIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Lower media volume while talking</h3>
                <p className="voiceos-row-desc">
                  Quiets music and other media while you talk, then restores it when you finish.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={muteWhenDictating}
              onToggle={() => setMuteWhenDictating((prev) => !prev)}
              label="Lower media volume while talking"
            />
          </div>
        </Card>
      </div>

      {/* 5. Extras Section */}
      <div className="voiceos-settings-section">
        <h3 className="voiceos-section-header">Extras</h3>

        {/* Creator Mode */}
        <Card isDarkMode={isDarkMode} className="p-5">
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <SparklesIcon size={20} className="text-gray-300" />
              <div>
                <h3 className="voiceos-row-title">Creator Mode</h3>
                <p className="voiceos-row-desc">
                  Show a &quot;Powered by VoiceOS&quot; badge while dictating and in Agent Mode.
                </p>
              </div>
            </div>
            <AppleSwitch
              checked={creatorMode}
              onToggle={() => setCreatorMode((prev) => !prev)}
              label="Creator Mode"
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

