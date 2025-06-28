import { createSHA256, createSHA512, createBLAKE3 } from 'hash-wasm';
import type { HashAlgo, HashResult } from './types.js';

type Factory = () => Promise<{ update(data: Uint8Array): void; digest(): string }>;

const factories: Record<HashAlgo, Factory> = {
  sha256: createSHA256 as Factory,
  sha512: createSHA512 as Factory,
  blake3: createBLAKE3 as Factory,
};

export async function hashBrowser(blob: Blob, algo: HashAlgo): Promise<HashResult> {
  try {
    const hasher = await factories[algo]();
    let bytes = 0;

    // reader loop ‑ works without async‑iter support
    const reader = blob.stream().getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value as Uint8Array;
      hasher.update(chunk);
      bytes += chunk.byteLength;
    }

    return { ok: true, hash: hasher.digest(), bytes, algo };
  } catch (e: any) {
    return { ok: false, code: 'EBROWSER', message: String(e?.message ?? e), cause: e };
  }
}
