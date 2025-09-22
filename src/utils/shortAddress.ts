export const shortAddress = (a: string) =>
  a?.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
