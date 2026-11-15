// Put the scene at the user's eye level: offset the XR reference space so the head starts at (0, eyeY, 0) in
// scene coordinates. The head, hands and controllers all come through this space, so hand control still lines up.
import type { Vec3 } from '../config';

/** Origin of the offset reference space, in the base (local-floor) space, for a head at `head`. */
export function eyeLevelOffset(head: Vec3, eyeY: number): Vec3 {
  return [head[0], head[1] - eyeY, head[2]];
}

/** A head pose is usable once tracking reports a plausible height (the first frames can be all zeros). */
export function headReady(head: Vec3): boolean {
  return head[1] > 0.3 && head[1] < 2.6;
}
