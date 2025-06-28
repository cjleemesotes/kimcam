import {
  NearBindgen, call, view, LookupMap, near, assert
} from 'near-sdk-js';

/**
 * Registry
 * ──────────────────────────────────────────────────────────
 * 1.  record_hash / get_hash     – legacy single‑file hash
 * 2.  store_proof  / get_proof   – Merkle root for a video
 */
@NearBindgen({})
export class Registry {
  counter: bigint;
  hashes!: LookupMap<string>;            // “!” allows late init
  proofs!: LookupMap<string>;

  constructor () {
    this.counter = 0n;
    this.hashes  = new LookupMap<string>('h');
    this.proofs  = new LookupMap<string>('p');
  }

  /** called by near-sdk-js after state is loaded */
  deserialize (): void {
    /* re‑attach prototypes OR create maps if they didn’t exist in older state */
    // @ts-ignore
    this.hashes = Object.assign(new LookupMap<string>('h'), this.hashes ?? {});
    // @ts-ignore
    this.proofs = Object.assign(new LookupMap<string>('p'), this.proofs ?? {});
  }

  /* ── Single‑hash API (used by hash‑cli) ───────────────────────── */
  @call({})
  record_hash ({ hash }: { hash: string }): string {
    assert(hash, 'hash required');
    this.counter += 1n;
    const id = this.counter.toString();
    this.hashes.set(id, hash);
    near.log(`{"event":"hash_recorded","id":"${id}"}`);
    return id;
  }

  @view({})
  get_hash ({ id }: { id: string }): string | null {
    return this.hashes.get(id) ?? null;
  }

  /* ── Video proof API (used by ProofCam backend) ───────────────── */
  @call({})
  store_proof ({ video_id, merkle_root }:
               { video_id: string; merkle_root: string }): void {
    assert(video_id && merkle_root, 'video_id & merkle_root required');
    assert(!this.proofs.get(video_id), 'proof already exists');
    this.proofs.set(video_id, merkle_root);
    near.log(`{"event":"proof_recorded","video_id":"${video_id}"}`);
  }

  @view({})
  get_proof ({ video_id }: { video_id: string }): string | null {
    /* in case deserialize didn’t run (cold state), guarantee map exists */
    if (!this.proofs) this.proofs = new LookupMap<string>('p');
    return this.proofs.get(video_id) ?? null;
  }
}
