/**
 * Whether an application file can run without a window (`--server`). The same rule is used by
 * tests/applications_smoke.test.ts (which starts these) and by the generated application index.
 */
export function isHeadless(source: string): boolean {
  return /READY:\$\{|server running at/.test(source);
}
