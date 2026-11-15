export interface ClipboardSnapshot {
  text: string
  html?: string
}

export interface ClipboardDriver {
  read(): Promise<ClipboardSnapshot> | ClipboardSnapshot
  write(snapshot: ClipboardSnapshot | string): Promise<void> | void
}

export interface KeyDispatcher {
  paste(): Promise<void>
}

export interface PasteService {
  paste(text: string): Promise<void>
}

export class FakePasteService implements PasteService {
  readonly pasted: string[] = []

  async paste(text: string): Promise<void> {
    this.pasted.push(text)
  }
}
