/**
 * Demo mode marks the running app and every generated PDF as synthetic output.
 *
 * The dev stack seeds a corpus of fabricated patients, referring doctors and
 * staff. Nothing about a record on screen or in a report PDF otherwise says
 * "this is not a patient", which is a hazard as soon as a screenshot or an
 * exported report leaves the machine that produced it.
 *
 * Defaults to on outside production, so a stack is never mistaken for a real
 * one through omission. Set `DEMO_MODE=false` to force it off (for example when
 * running a staging deployment that holds real data under NODE_ENV=development),
 * or `DEMO_MODE=true` to force it on.
 */
export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE !== undefined) return process.env.DEMO_MODE === 'true';
  return process.env.NODE_ENV !== 'production';
}
