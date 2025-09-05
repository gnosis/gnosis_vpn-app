import type { Destination, Path } from '../services/vpnService';

export const canonicalizeMeta = (
  meta: Record<string, string> | undefined
): string => {
  if (!meta) return '';
  const keys = Object.keys(meta).sort();
  const ordered: Record<string, string> = {};
  for (const key of keys) ordered[key] = meta[key];
  return JSON.stringify(ordered);
};

export const canonicalizePath = (path: Path): string => {
  if ('Hops' in path) return `Hops:${path.Hops}`;
  return `IntermediatePath:${(path.IntermediatePath || []).join(',')}`;
};

export const destinationSignature = (dest: Destination): string => {
  return [
    dest.address,
    canonicalizeMeta(dest.meta),
    canonicalizePath(dest.path),
  ].join('|');
};

export const areDestinationsEqualUnordered = (
  a: Destination[],
  b: Destination[]
): boolean => {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const setA = new Set(a.map(destinationSignature));
  if (setA.size !== a.length) {
    const countsA = new Map<string, number>();
    for (const sig of a.map(destinationSignature)) {
      countsA.set(sig, (countsA.get(sig) || 0) + 1);
    }
    const countsB = new Map<string, number>();
    for (const sig of b.map(destinationSignature)) {
      countsB.set(sig, (countsB.get(sig) || 0) + 1);
    }
    if (countsA.size !== countsB.size) return false;
    for (const [sig, count] of countsA) {
      if (countsB.get(sig) !== count) return false;
    }
    return true;
  }
  const setB = new Set(b.map(destinationSignature));
  if (setB.size !== b.length) return false;
  for (const sig of setA) {
    if (!setB.has(sig)) return false;
  }
  return true;
};
