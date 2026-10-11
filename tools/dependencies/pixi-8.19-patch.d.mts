export interface PixiPatchManifest {
  version: string;
  targets: {
    path: string;
    originalSha256: string;
    patchedSha256: string;
    replacements: { from: string; to: string }[];
  }[];
}
export function sha256(text: string): string;
export function applyPixiPatch(
  root: string,
  manifest?: PixiPatchManifest,
): {
  version: string;
  validated: number;
  written: number;
};
