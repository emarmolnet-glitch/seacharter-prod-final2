/** Commercial references are allocated by the persistent annual counter. */
export function generateRandomProjectRef() {
  return globalThis.FixtureReferenceService?.create() || '';
}
export const generateNewProjectRef = generateRandomProjectRef;
export default generateRandomProjectRef;
