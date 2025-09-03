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

export const areDestinationsEqualUnordered = (
  a: Destination[],
  b: Destination[]
): boolean => {
  if (a.length !== b.length) return false;
  const aSorted = [...a].sort((x, y) => x.address.localeCompare(y.address));
  const bSorted = [...b].sort((x, y) => x.address.localeCompare(y.address));
  for (let i = 0; i < aSorted.length; i += 1) {
    const da = aSorted[i];
    const db = bSorted[i];
    if (da.address !== db.address) return false;
    if (canonicalizeMeta(da.meta) !== canonicalizeMeta(db.meta)) return false;
    if (canonicalizePath(da.path) !== canonicalizePath(db.path)) return false;
  }
  return true;
};
