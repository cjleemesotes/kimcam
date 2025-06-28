import { createReadStream, statSync } from 'node:fs';
import { createHash as nodeHash } from 'node:crypto';
import type { HashAlgo, HashResult } from './types.js';

async function getHasher(algo: HashAlgo) {
  if (algo !== 'blake3') return nodeHash(algo);
  try {
    const { createHash } = await import('blake3');      // optional dep
    return createHash();
  } catch {
    const err = new Error('BLAKE3 requires `npm i blake3`');
    (err as any).code = 'EUNSUPPORTED';
    throw err;
  }
}

export async function hashNode(path: string, algo: HashAlgo, chunk = 1 << 20): Promise<HashResult> {
  try {
    const size = statSync(path).size;
    const hash = await getHasher(algo);
    return await new Promise<HashResult>((res) =>
      createReadStream(path, { highWaterMark: chunk })
        .on('data', (c) => hash.update(c))
        .on('end', () => res({ ok: true, hash: hash.digest('hex'), bytes: size, algo }))
        .on('error', (e: any) =>
          res({ ok: false, code: e.code ?? 'EIO', message: String(e.message), cause: e }),
        ),
    );
  } catch (e: any) {
    return {
      ok: false,
      code: e.code === 'EUNSUPPORTED' ? 'EUNSUPPORTED' : 'EUNKNOWN',
      message: String(e.message ?? e),
      cause: e,
    };
  }
}
