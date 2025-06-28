import {
  NearBindgen,
  call,
  view,
  LookupMap,
  near,
  assert,
} from 'near-sdk-js';

/**
 * Immutable hash registry:
 *   • auto‑incrementing ID
 *   • ID → hex hash
 */
@NearBindgen({})
export class Registry {
  counter: bigint;
  hashes: LookupMap<string>;

  constructor() {
    this.counter = 0n;
    this.hashes = new LookupMap<string>('h');
  }

  deserialize(): void {
    // restore prototype
    // @ts-ignore
    this.hashes = Object.assign(new LookupMap<string>('h'), this.hashes);
  }

  @call({})
  record_hash({ hash }: { hash: string }): string {
    assert(hash && typeof hash === 'string', 'Parameter "hash" must be a non‑empty string');

    this.counter += 1n;
    const id = this.counter.toString();
    this.hashes.set(id, hash);

    near.log(`{"event":"hash_recorded","id":"${id}","hash":"${hash}"}`);
    return id;
  }

  @view({})
  get_hash({ id }: { id: string }): string | null {
    return this.hashes.get(id) ?? null;
  }

  @view({})
  get_counter(): string {
    return this.counter.toString();
  }
}
