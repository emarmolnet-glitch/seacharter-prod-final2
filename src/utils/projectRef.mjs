/**
 * Canonical Project Reference Generator
 * Format: "RDM/2026-" followed by 4 random digits (e.g. RDM/2026-4521)
 */
export function generateRandomProjectRef() {
  return `RDM/2026-${Math.floor(1000 + Math.random() * 9000)}`;
}

export const generateNewProjectRef = generateRandomProjectRef;
export default generateRandomProjectRef;
