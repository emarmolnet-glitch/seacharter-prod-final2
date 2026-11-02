/** Cryptographic references avoid the collision-prone four-digit namespace. */
export function generateRandomProjectRef() {
  const uuid = globalThis.crypto.randomUUID().toUpperCase();
  return `RDM/${new Date().getUTCFullYear()}-${uuid}`;
}

export const generateNewProjectRef = generateRandomProjectRef;
export default generateRandomProjectRef;
