import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Nameplate {
  readonly object: CSS2DObject;
  private readonly nameEl = document.createElement('div');
  private readonly statusEl = document.createElement('div');
  constructor() {
    const el = document.createElement('div');
    el.style.cssText =
      'padding:2px 8px;border-radius:6px;background:rgba(34,36,38,.75);color:#fff;font:600 12px system-ui;text-align:center;white-space:nowrap';
    this.statusEl.style.cssText = 'font-weight:400;font-size:11px;color:#6CB33F';
    el.append(this.nameEl, this.statusEl);
    this.object = new CSS2DObject(el);
    this.object.position.set(0, 2.1, 0);
  }
  /** Text only: a replicated name is never parsed as markup. */
  set(name: string, status: string): void {
    if (this.nameEl.textContent !== name) this.nameEl.textContent = name;
    if (this.statusEl.textContent !== status) this.statusEl.textContent = status;
  }
  /** Detaches the label; CSS2DObject removes its element from the overlay on 'removed'. */
  dispose(): void {
    this.object.removeFromParent();
    this.object.element.remove();
  }
}
