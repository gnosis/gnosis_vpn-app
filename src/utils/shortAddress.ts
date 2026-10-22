export const shortAddress = (a: string) =>
  a?.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

/** A peer id squeezed to its ends, e.g. "12D3…x9"; a short one stays whole. */
export const shortPeerId = (id: string) =>
  id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-2)}` : id;
