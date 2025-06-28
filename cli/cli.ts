#!/usr/bin/env node
import { Command } from 'commander';
import chalk       from 'chalk';
import { hashFile } from '../src/index.js';

import { Account }                       from '@near-js/accounts';
import { JsonRpcProvider }               from '@near-js/providers';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { KeyPairSigner }                 from '@near-js/signers';
import { KeyPair }                       from '@near-js/crypto';

/* ------------------------------------------------------------------ */
/* Configuration (override via environment variables)                 */
/* ------------------------------------------------------------------ */
// ─── config ─────────────────────────────────────────────────────────
const CONTRACT   = 'cj4.testnet';     // process.env.NEAR_CONTRACT ?? 'cj4.testnet';   // contract you call
const SIGNER     = 'cj4.testnet';     // process.env.NEAR_SIGNER   ?? 'cj4.testnet';        // who pays & signs
const NETWORK_ID = process.env.NEAR_NETWORK  ?? 'testnet';
const RPC_URL    = `https://rpc.${NETWORK_ID}.near.org`;
const CRED_DIR   = process.env.NEAR_CREDENTIALS_DIR ??
                   `${process.env.HOME}/.near-credentials`;

// ─── helper ─────────────────────────────────────────────────────────
async function getAccount(): Promise<Account> {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const keyStore = new UnencryptedFileSystemKeyStore(CRED_DIR);
  const key: KeyPair | null = await keyStore.getKey(NETWORK_ID, SIGNER);
  if (!key) throw new Error(`Key for ${SIGNER} not found in ${CRED_DIR}`);
  const signer = new KeyPairSigner(key);
  return new Account(SIGNER, provider, signer);
}

const provider = new JsonRpcProvider({ url: RPC_URL });
async function viewGetHash(id: string): Promise<string | null> {
  const result: any = await provider.query({
    request_type: 'call_function',
    account_id:   CONTRACT,
    method_name:  'get_hash',
    args_base64:  Buffer.from(JSON.stringify({ id })).toString('base64'),
    finality:     'optimistic'
  });

  const raw = Buffer.from(result.result as Uint8Array).toString();
  return raw === '' ? null : JSON.parse(raw);
}

/* ------------------------------------------------------------------ */
/* Commander CLI                                                      */
/* ------------------------------------------------------------------ */
const prog = new Command()
  .name('hash-cli')
  .version('0.1.0');

/* ----- anchor ----------------------------------------------------- */
prog.command('anchor <file>')
  .option('-a, --algo <algo>', 'sha256 | sha512 | blake3', 'sha256')
  .description('hash <file> locally and store the hash on‑chain')
  .action(async (file, opts) => {
    const res = await hashFile(file, { algorithm: opts.algo });
    if (!res.ok) { console.error(chalk.red(res.message)); process.exit(2); }

    const account = await getAccount();
    const outcome = await account.functionCall({
      contractId: CONTRACT,
      methodName: 'record_hash',
      args:       { hash: res.hash },
      gas:        BigInt('30000000000000'),
      attachedDeposit: BigInt(0)
    });

    const id64 = (outcome as any).status.SuccessValue ?? '';
    const id   = id64 ? JSON.parse(Buffer.from(id64, 'base64').toString()) : '(unknown)';
    console.log(chalk.green(`✔ stored id ${id}`));
  });

/* ----- verify ----------------------------------------------------- */
prog.command('verify <id> <file>')
  .option('-a, --algo <algo>', 'sha256 | sha512 | blake3', 'sha256')
  .description('rehash <file> and compare with on‑chain hash')
  .action(async (id, file, opts) => {
    const res = await hashFile(file, { algorithm: opts.algo });
    if (!res.ok) { console.error(chalk.red(res.message)); process.exit(2); }

    const stored = await viewGetHash(id);
    if (stored === null) {
      console.error(chalk.red(`No hash for id ${id}`));
      process.exit(3);
    }

    const ok = stored === res.hash;
    console.log(ok ? chalk.green('✓ match') : chalk.red('✗ mismatch'));
    process.exit(ok ? 0 : 1);
  });

prog.parseAsync();
