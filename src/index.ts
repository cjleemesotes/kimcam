import { hashNode }   from './node-engine.js';
import { hashBrowser } from './browser-engine.js';
import type { HashAlgo, HashResult } from './types.js';

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

/** Portable file/Blob hashing (hex) */
export async function hashFile(
  src: string | Blob,
  opts?: { algorithm?: HashAlgo; chunkSize?: number },
): Promise<HashResult> {
  const algo = opts?.algorithm ?? 'sha256';
  if (isNode && typeof src === 'string')
    return hashNode(src, algo, opts?.chunkSize);
  if (!isNode && src instanceof Blob)
    return hashBrowser(src, algo);
  return { ok: false, code: 'ETYPE', message: 'Invalid source for current runtime' };
}

export type { HashAlgo, HashResult } from './types.js';
