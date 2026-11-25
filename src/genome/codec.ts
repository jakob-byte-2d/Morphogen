import { normalizeGenome, type Genome } from "../engine";

/**
 * Genomes travel as text: in links (?g=...), in local storage and later to
 * the server. Numbers are rounded to 4 decimals to keep links short; always
 * use the decoded genome afterwards, so everyone simulates exactly the same.
 */

function round(_key: string, value: unknown): unknown {
  return typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value;
}

export function encodeGenome(g: Genome): string {
  const bytes = new TextEncoder().encode(JSON.stringify(g, round));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeGenome(text: string): Genome | null {
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return normalizeGenome(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** The genome exactly as it will look after being shared: encode, then decode. */
export function canonical(g: Genome): Genome {
  return decodeGenome(encodeGenome(g)) ?? normalizeGenome(g);
}
