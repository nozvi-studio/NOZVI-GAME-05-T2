import type { MoveInput } from '@office/protocol';

export function toMoveInput(pressed: ReadonlySet<string>): MoveInput {
  const axis = (pos: string, neg: string) =>
    (pressed.has(pos) ? 1 : 0) - (pressed.has(neg) ? 1 : 0);
  return {
    forward: axis('KeyW', 'KeyS'),
    right: axis('KeyD', 'KeyA'),
    run: pressed.has('ShiftLeft') || pressed.has('ShiftRight'),
  };
}

export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private readonly down = (e: KeyboardEvent) => this.pressed.add(e.code);
  private readonly up = (e: KeyboardEvent) => this.pressed.delete(e.code);
  private readonly blur = () => this.pressed.clear();

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.blur);
  }
  read(): MoveInput {
    return toMoveInput(this.pressed);
  }
  dispose(): void {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.blur);
  }
}
