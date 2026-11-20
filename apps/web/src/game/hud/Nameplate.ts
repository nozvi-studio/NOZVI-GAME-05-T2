import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** REQ-CHAT-003 (T-1698): speech bubble look; every value is a `tokens.css` token. */
const BUBBLE_STYLE = [
  'position:absolute',
  'left:50%',
  'bottom:calc(100% + var(--ov-space-1))',
  'transform:translateX(-50%)',
  'width:max-content',
  'max-width:200px',
  'padding:var(--ov-space-1) var(--ov-space-2)',
  'border-radius:var(--ov-radius-md)',
  'background:var(--ov-color-paper)',
  'color:var(--ov-color-ink)',
  'box-shadow:var(--ov-shadow-1)',
  'font:var(--ov-font-weight-regular) var(--ov-font-size-sm)/var(--ov-line-height) var(--ov-font-family)',
  'white-space:normal',
  'overflow-wrap:anywhere',
  'text-align:center',
  'display:none',
].join(';');

export class Nameplate {
  readonly object: CSS2DObject;
  private readonly nameEl = document.createElement('div');
  private readonly statusEl = document.createElement('div');
  private readonly bubbleEl = document.createElement('div');
  private reconnecting = false;
  private bubbleValue: string | null = null;
  constructor() {
    const el = document.createElement('div');
    el.style.cssText =
      'padding:2px 8px;border-radius:6px;background:rgba(34,36,38,.75);color:#fff;font:600 12px system-ui;text-align:center;white-space:nowrap';
    this.statusEl.style.cssText = 'font-weight:400;font-size:11px;color:#6CB33F';
    // The bubble sits just above the plate; CSS2DObject makes `el` absolutely positioned.
    this.bubbleEl.style.cssText = BUBBLE_STYLE;
    this.bubbleEl.dataset.chatBubble = '';
    el.append(this.bubbleEl, this.nameEl, this.statusEl);
    this.object = new CSS2DObject(el);
    this.object.position.set(0, 2.1, 0);
  }
  /**
   * Text only: a replicated name is never parsed as markup. `reconnecting` dims the plate
   * and colors the status as a warning (REQ-NET-005 marker).
   */
  set(name: string, status: string, reconnecting = false): void {
    if (this.nameEl.textContent !== name) this.nameEl.textContent = name;
    if (this.statusEl.textContent !== status) this.statusEl.textContent = status;
    if (this.reconnecting !== reconnecting) {
      this.reconnecting = reconnecting;
      this.object.element.style.opacity = reconnecting ? '0.6' : '';
      this.object.element.dataset.reconnecting = reconnecting ? 'true' : '';
      this.statusEl.style.color = reconnecting ? '#F5A623' : '#6CB33F';
    }
  }
  /**
   * REQ-CHAT-003 (T-1698): the speech bubble text (already cut by `speechBubbles`), or null
   * to hide it. Set as `textContent`, never as markup.
   */
  setBubble(text: string | null): void {
    if (text === this.bubbleValue) return;
    this.bubbleValue = text;
    this.bubbleEl.textContent = text ?? '';
    this.bubbleEl.style.display = text === null ? 'none' : 'block';
  }
  /** The bubble text as drawn, null when hidden. */
  get bubble(): string | null {
    return this.bubbleValue;
  }
  /** Detaches the label; CSS2DObject removes its element from the overlay on 'removed'. */
  dispose(): void {
    this.object.removeFromParent();
    this.object.element.remove();
  }
}
