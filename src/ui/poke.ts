// Press logic for poke buttons, separate from three.js so it can be unit tested.
// One poke = at most one press per panel: after a press the panel ignores every button until no fingertip is
// inside any of its buttons. Without this, pressing Stop swaps the button under the finger to Start (same spot)
// and the same poke presses Start too, restarting the round.
import { POKE_DEBOUNCE_MS } from '../config';

export class PokeLatch {
  private lastFire = new Map<string, number>();
  private inside = new Set<string>();
  private armed = true;

  /** ids of buttons a fingertip is inside this frame -> the id to press, or null */
  update(nowInside: Set<string>, nowMs: number): string | null {
    let fired: string | null = null;
    if (nowInside.size === 0) this.armed = true;
    for (const id of nowInside) {
      if (fired || !this.armed || this.inside.has(id)) continue;
      if (nowMs - (this.lastFire.get(id) ?? -Infinity) < POKE_DEBOUNCE_MS) continue;
      this.lastFire.set(id, nowMs);
      this.armed = false;
      fired = id;
    }
    this.inside = new Set(nowInside);
    return fired;
  }
}
