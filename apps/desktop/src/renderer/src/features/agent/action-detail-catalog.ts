import type { AgentActionGlyph, AgentActionId } from './types'

export interface ActionCopy {
  heroCaption: string
  glanceCaption: string
  queryChunks: string[]
  answer: string
  about: string
  sampleCommands: string[]
}

export interface NativeActionMeta {
  glyph: AgentActionGlyph
  developer: string
  type: string
  copy: {
    en: ActionCopy
    ja?: ActionCopy
  }
}

export const NATIVE_ACTION_META: Record<AgentActionId, NativeActionMeta> = {
  insertText: {
    glyph: 'pointerTrail',
    developer: 'VoiceOS',
    type: 'System action',
    copy: {
      en: {
        heroCaption: 'Point at it, ask about it',
        glanceCaption: 'Answers land in the notch',
        queryChunks: ['What ', 'does ', 'this ', 'error ', 'mean?'],
        answer:
          "The API key isn't set — nothing is providing API_KEY when the client starts. Add it to .env.local and restart the dev server.",
        about:
          "Give the agent a live view of your screen. Ask about anything you're looking at — an error, a chart, a paragraph — and point with your cursor to say which part you mean. The screen is only captured while you're asking, and only while this is on.",
        sampleCommands: [
          'What does this error mean?',
          'Summarize this page',
          'What should I reply here?'
        ]
      },
      ja: {
        heroCaption: '指して、そのまま聞く',
        glanceCaption: '答えはノッチに表示',
        queryChunks: ['この', 'エラーの', '意味は？'],
        answer:
          'APIキーが設定されていません。クライアントの起動時にAPI_KEYが渡されていないので、.env.localに追加して開発サーバーを再起動してください。',
        about:
          'エージェントに画面を見せて質問できます。エラーやグラフ、文章など、見ているものについてそのまま聞けます。カーソルで「ここ」と指すことも可能です。画面のキャプチャは質問中だけ、この設定がオンのときだけ行われます。',
        sampleCommands: [
          'このエラーはどういう意味？',
          'このページを要約して',
          'ここには何て返信すればいい？'
        ]
      }
    }
  },
  editText: {
    glyph: 'textSelection',
    developer: 'VoiceOS',
    type: 'System action',
    copy: {
      en: {
        heroCaption: 'Highlight it, say the change',
        glanceCaption: 'The notch confirms the change',
        queryChunks: ['Make ', 'this ', 'sound ', 'more ', 'formal'],
        answer: 'Done — that line now reads “Could you send the file?” in your draft.',
        about:
          'Rewrite, translate, or fix whatever you have highlighted. The agent works from your exact selection and shows the result first — nothing is replaced until you insert it.',
        sampleCommands: [
          'Make this more concise',
          'Translate this to English',
          'Fix the grammar'
        ]
      },
      ja: {
        heroCaption: '選択して、言うだけ',
        glanceCaption: '変更内容はノッチで確認',
        queryChunks: ['もっと', '丁寧に', 'して'],
        answer: '置き換えました。下書きは「資料をお送りいただけますか？」になっています。',
        about:
          '選択中のテキストを書き換え・翻訳・修正します。エージェントは選択した範囲だけを対象にし、結果を先に表示します。挿入するまで元のテキストは変わりません。',
        sampleCommands: [
          'もっと簡潔にして',
          'これを英語に翻訳して',
          '誤字を直して'
        ]
      }
    }
  },
  createPrompt: {
    glyph: 'promptDocument',
    developer: 'VoiceOS',
    type: 'System action',
    copy: {
      en: {
        heroCaption: 'Circle it, get the prompt',
        glanceCaption: 'Screenshots fly into the notch',
        queryChunks: ['Create ', 'a ', 'prompt ', 'to ', 'fix ', 'this'],
        answer: "Prompt's ready — open Claude and hit Insert.",
        about:
          'Talk through what you want while circling things on screen with your cursor. Each circle captures that window — with your ink and a number on it — and floats into the notch. VoiceOS turns it all into one polished prompt that references every screenshot, with an Insert button that places the images and text straight into Claude, ChatGPT, Cursor, or your terminal agent. Uses the same screen access as “Point and ask about your screen.”',
        sampleCommands: [
          'Create a prompt to fix this layout',
          'Make a prompt for Claude about these designs',
          'Write a prompt to refactor this code'
        ]
      },
      ja: {
        heroCaption: '囲んで、プロンプトに',
        glanceCaption: 'スクショがノッチに集まる',
        queryChunks: ['これを直す', 'プロンプトを', '作って'],
        answer: 'プロンプトができました。Claudeを開いてInsertを押してください。',
        about:
          '話しながら、カーソルで画面上のものを丸く囲んでください。囲むたびにそのウィンドウが番号つきでキャプチャされ、ノッチに集まります。VoiceOSがすべてを1つの洗練されたプロンプトにまとめ、InsertボタンでClaude・ChatGPT・Cursor・ターミナルのAIに画像ごと挿入できます。画面へのアクセスは「カーソルで指して質問する」と共通です。',
        sampleCommands: [
          'このレイアウトを直すプロンプトを作って',
          'このデザインについてClaude用のプロンプトを作って',
          'このコードをリファクタするプロンプトを書いて'
        ]
      }
    }
  },
  controlPlayback: {
    glyph: 'music',
    developer: 'VoiceOS',
    type: 'System action',
    copy: {
      en: {
        heroCaption: 'Skip without switching apps',
        glanceCaption: 'It names the track it moved to',
        queryChunks: ['Skip ', 'this ', 'song'],
        answer: 'Skipped — now playing Golden Hour by JVKE.',
        about:
          "Play, pause, and skip in whatever music player is active — Spotify, Apple Music, or the browser tab that's making noise.",
        sampleCommands: ['Pause the music', 'Next track', 'Play it again']
      },
      ja: {
        heroCaption: 'アプリを切り替えず曲送り',
        glanceCaption: '次の曲名もノッチに',
        queryChunks: ['この曲を', 'スキップ'],
        answer: 'スキップしました。次はJVKEの「Golden Hour」です。',
        about:
          'アクティブな音楽プレーヤーで再生・一時停止・スキップができます。SpotifyやApple Music、音の鳴っているブラウザタブにも対応します。',
        sampleCommands: ['音楽を止めて', '次の曲', 'もう一回再生して']
      }
    }
  },
  openApp: {
    glyph: 'appLaunch',
    developer: 'VoiceOS',
    type: 'System action',
    copy: {
      en: {
        heroCaption: 'Any app, hands free',
        glanceCaption: 'Launched, confirmed in the notch',
        queryChunks: ['Open ', 'Figma'],
        answer: 'Figma is open.',
        about:
          "Launch or focus any installed app by name. If it's already running, VoiceOS brings it to the front instead of opening a second copy.",
        sampleCommands: ['Open Chrome', 'Switch to Slack', 'Open Spotify']
      },
      ja: {
        heroCaption: 'ひと言でアプリを起動',
        glanceCaption: '起動結果もノッチに',
        queryChunks: ['Figmaを', '開いて'],
        answer: 'Figmaを開きました。',
        about:
          'インストール済みのアプリを名前で起動・フォーカスします。すでに起動している場合は、新しく開かずに前面に表示します。',
        sampleCommands: [
          'Chromeを開いて',
          'Slackに切り替えて',
          'Spotifyを開いて'
        ]
      }
    }
  },
  reminders: {
    glyph: 'clock',
    developer: 'VoiceOS',
    type: 'System action',
    copy: {
      en: {
        heroCaption: 'Say it now, get reminded later',
        glanceCaption: 'The time it landed on',
        queryChunks: [
          'Remind ',
          'me ',
          'in ',
          '10 ',
          'minutes ',
          'to ',
          'stand ',
          'up'
        ],
        answer: "Saved — I'll remind you at 5:20 PM to stand up and stretch.",
        about:
          'Set a reminder for a time you name and VoiceOS notifies you when it comes around. Works entirely on your computer, with no connected account. Turning this off stops new reminders being made; anything already scheduled still fires, and you can still list or cancel it.',
        sampleCommands: [
          'Remind me in 10 minutes to stand up',
          'Remind me at 3pm to call the bank',
          'What reminders do I have?'
        ]
      },
      ja: {
        heroCaption: 'いま言って、あとで思い出す',
        glanceCaption: '設定された時刻もその場で',
        queryChunks: ['10分後に', '立ち上がるよう', 'リマインドして'],
        answer: '17:20に「立ち上がって伸びをする」と通知します。',
        about:
          '指定した時刻にVoiceOSが通知します。アカウント連携は不要で、パソコンのなかだけで完結します。オフにすると新しいリマインダーは作れなくなりますが、設定済みのものはそのまま通知され、一覧の確認や取り消しもできます。',
        sampleCommands: [
          '10分後に立ち上がるようリマインドして',
          '15時に銀行へ電話するようリマインドして',
          'いまのリマインダーを教えて'
        ]
      }
    }
  }
}

export function getActionMeta(actionId: AgentActionId): NativeActionMeta {
  return NATIVE_ACTION_META[actionId]
}
