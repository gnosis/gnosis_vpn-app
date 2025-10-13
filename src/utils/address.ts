export type EthAddressInput = string | number[] | Uint8Array;

function normalizeTo20Bytes(bytes: number[]): number[] {
  const clamped = bytes.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    const i = n | 0;
    return i < 0 ? 0 : i > 255 ? 255 : i;
  });

  if (clamped.length === 20) return clamped;
  if (clamped.length > 20) return clamped.slice(-20);
  return Array(20 - clamped.length)
    .fill(0)
    .concat(clamped);
}

function hexFromBytes(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseByteArrayString(input: string): number[] | null {
  const s = input.trim();
  const match = s.match(/^\[?\s*([^\]]+?)\s*\]?$/);
  if (!match) return null;
  const parts = match[1]
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;

  const out: number[] = [];
  for (const p of parts) {
    const isHex = /^0x[0-9a-fA-F]{1,2}$/.test(p);
    const isDec = /^\d+$/.test(p);
    if (!isHex && !isDec) return null;
    const v = parseInt(p, isHex ? 16 : 10);
    if (Number.isNaN(v) || v < 0 || v > 255) return null;
    out.push(v);
  }
  return out;
}

export function getEthAddress(input: EthAddressInput): string {
  if (typeof input === "string") {
    const raw = input.trim();

    if (raw.startsWith("0x") || raw.startsWith("0X")) {
      const body = raw.slice(2).toLowerCase();
      const even = body.length % 2 === 1 ? "0" + body : body;
      const normalized = even.length === 40
        ? even
        : even.slice(-40).padStart(40, "0");
      return "0x" + normalized;
    }

    if (/^[0-9a-fA-F]+$/.test(raw)) {
      const lower = raw.toLowerCase();
      const even = lower.length % 2 === 1 ? "0" + lower : lower;
      const normalized = even.length === 40
        ? even
        : even.slice(-40).padStart(40, "0");
      return "0x" + normalized;
    }

    const parsed = parseByteArrayString(raw);
    if (parsed) {
      const bytes = normalizeTo20Bytes(parsed);
      return "0x" + hexFromBytes(bytes);
    }

    throw new Error("Unsupported address input format");
  }

  const bytes = normalizeTo20Bytes(Array.from(input));
  return "0x" + hexFromBytes(bytes);
}

export function toBytes20(input: string): number[] {
  const raw = input.trim();

  if (raw.startsWith("0x") || raw.startsWith("0X")) {
    const body = raw.slice(2).toLowerCase();
    const even = body.length % 2 === 1 ? "0" + body : body;
    const normalized = even.length === 40
      ? even
      : even.slice(-40).padStart(40, "0");
    const out: number[] = [];
    for (let i = 0; i < 40; i += 2) {
      out.push(parseInt(normalized.slice(i, i + 2), 16));
    }
    return out;
  }

  if (/^[0-9a-fA-F]+$/.test(raw)) {
    const lower = raw.toLowerCase();
    const even = lower.length % 2 === 1 ? "0" + lower : lower;
    const normalized = even.length === 40
      ? even
      : even.slice(-40).padStart(40, "0");
    const out: number[] = [];
    for (let i = 0; i < 40; i += 2) {
      out.push(parseInt(normalized.slice(i, i + 2), 16));
    }
    return out;
  }

  const parsed = parseByteArrayString(raw);
  if (parsed) return normalizeTo20Bytes(parsed);

  throw new Error("Unsupported bytes20 input format");
}
