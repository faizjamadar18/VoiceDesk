export interface PasteService {
  paste(text: string): Promise<void>
}

export class FakePasteService implements PasteService {
  readonly pasted: string[] = []

  async paste(text: string): Promise<void> {
    this.pasted.push(text)
  }
}
