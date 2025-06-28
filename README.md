Below is a **single doc you can paste in a README**.
Follow it top‑to‑bottom on **macOS, Linux, or Windows 11 + WSL 2** and you will end up exactly where you are now:

* `hash-cli` globally available (`anchor` / `verify`)
* a minimal **Express + static HTML** server (`server.cjs` + `public/index.html`)
* a NEAR test‑net contract that stores file hashes
* a browser UI that anchors/verifies videos in 30 s

> Everything lives in one repo — no external templates.

---

# 0  TL;DR install matrix

| Area / purpose         | Tool / package                                              | Comment                         |
| ---------------------- | ----------------------------------------------------------- | ------------------------------- |
| NEAR deploy & calls    | **near‑cli v3**                                             | Rust binary shipped through npm |
| TypeScript → Wasm      | **near‑sdk‑js**                                             | Decorator support               |
| Node runtime SDK (CLI) | `@near-js/accounts providers keystores-node signers crypto` | v2 modular                      |
| Hash CLI pretties      | `chalk` `commander` `hash-wasm` `blake3` *(opt)*            |                                 |
| Minimal backend        | `express` `multer`                                          | All you need                    |
| Front‑end helper       | **Alpine.js** (CDN) + **Tailwind** (CDN)                    | Nothing to build                |
| Node LTS               | via **nvm**                                                 | Works everywhere                |
| Misc                   | `git` `jq` `curl` `build-essential`                         | Compilers etc.                  |

---

# 1  Base workstation

### Linux / macOS

```bash
sudo apt update -qq && sudo apt install -yqq git jq curl build-essential
# macOS →  brew install git jq curl coreutils
```

### Windows 11 + WSL 2

```powershell
wsl --install        # one‑liner, reboots once
```

Enter the Ubuntu shell and run the Linux commands above.

---

# 2  Node LTS + near‑cli

```bash
# nvm
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

# Node + CLI
nvm install --lts -q && nvm use --lts
npm i -g near-cli

near --version   # near-cli 3.x.x
node --version   # v20 or v22
```

---

# 3  Create / import a **testnet** account

*New?* → wallet.testnet.near.org → choose `myname.testnet` → secure it → faucet 5 Ⓝ.

```bash
near login                          # opens browser once
# key saved in ~/.near-credentials/testnet/<account>.json
```

---

# 4  Scaffold a TypeScript contract

```bash
mkdir -p ~/near/hash-registry && cd ~/near/hash-registry
npm init -y
npm i -D near-sdk-js@latest typescript@4.9
npx near-sdk-js init                   # creates src/contract.ts
```

`tsconfig.json` (minimum):

```jsonc
{ "compilerOptions": {
    "target":"ES2020","module":"es2020","moduleResolution":"node",
    "lib":["ES2020","DOM"],"experimentalDecorators":true,
    "strict":true,"skipLibCheck":true
  },
  "include":["src/**/*.ts"]
}
```

```bash
npx near-sdk-js build src/contract.ts build/registry.wasm
```

Deploy once:

```bash
near deploy myname.testnet build/registry.wasm
```

*(This contract exposes `record_hash` and `get_hash`).*

---

# 5  Build **hash-cli**

\## 5‑a Install deps

```bash
npm install \
  @near-js/accounts @near-js/providers \
  @near-js/keystores-node @near-js/signers @near-js/crypto \
  chalk commander hash-wasm blake3
npm i -D typescript
```

\## 5‑b Folder layout

```
project/
├─ cli/cli.ts               # CLI source
├─ src/                     # hashing engines (node / browser)
├─ ambient.d.ts             # declare module 'blake3';
├─ tsconfig.cli.json
└─ package.json
```

> Full CLI source is at the end of the doc — copy it untouched.

\## 5‑c `tsconfig.cli.json`

```jsonc
{
  "compilerOptions":{
    "rootDir":".","outDir":"dist",
    "target":"ES2020","module":"es2020","moduleResolution":"node",
    "types":["node"],"esModuleInterop":true,
    "strict":true,"skipLibCheck":true
  },
  "include":["cli/**/*.ts","src/**/*.ts","ambient.d.ts"]
}
```

\## 5‑d package.json snippets

```jsonc
"scripts":{
  "build:wasm":"near-sdk-js build src/contract.ts build/registry.wasm",
  "build:cli":"tsc -p tsconfig.cli.json",
  "build":"npm run build:wasm && npm run build:cli",
  "start":"node server.cjs"
},
"bin":{"hash-cli":"dist/cli/cli.js"}
```

\## 5‑e Compile & link

```bash
npm run build
chmod +x dist/cli/cli.js
npm link --force           # makes hash-cli global
hash-cli --help
```

Smoke test:

```bash
hash-cli anchor sample.png      # → ✔ stored id 1
hash-cli verify 1 sample.png    # ✓ match
```

---

# 6  Add the **minimal backend + UI**

\## 6‑a Runtime deps

```bash
npm install express multer
```

\## 6‑b `server.cjs`  *(CommonJS; paste AS‑IS)*

```js
require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { execFile } = require('child_process');

const app = express();  const port = 3000;
app.use(express.static(path.join(__dirname,'public')));

const upload = multer({ dest:'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

/* ------------ anchor ------------ */
app.post('/process-video', upload.single('video'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'no file'});
  execFile('hash-cli',['anchor',req.file.path],(err,stdout,stderr)=>{
    fs.unlinkSync(req.file.path);
    if(err) { console.error(stderr); return res.status(500).json({error:'anchor failed'}); }
    const id = stdout.match(/stored id (\d+)/i)?.[1] ?? '(unknown)';
    res.json({ id });
  });
});

/* ------------ verify ------------ */
app.post('/verify-video', upload.single('video'), (req,res)=>{
  const { id } = req.body;
  if(!id||!req.file) return res.status(400).json({error:'need id & video'});
  execFile('hash-cli',['verify',id,req.file.path],(err)=>{
    fs.unlinkSync(req.file.path);
    res.json({ ok: !err });
  });
});

app.listen(port,()=>console.log('UI + API  ▶  http://localhost:'+port));
```

\## 6‑c Front‑end  `public/index.html`

*(Copy exactly; uses Alpine & Tailwind CDN)*

```html
<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><title>ProofCam ▶ NEAR</title>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 text-gray-800">
<div x-data="ui()" class="max-w-xl mx-auto p-6 space-y-8">
<h1 class="text-2xl font-bold">ProofCam ▶ NEAR</h1>

<section class="p-4 bg-white rounded shadow">
<h2 class="font-semibold mb-2">1. Anchor a video</h2>
<input type="file" accept="video/*" x-ref="file" class="mb-2"/>
<button class="px-4 py-1 bg-blue-600 text-white rounded" @click="anchor" :disabled="busy">
<template x-if="!busy">Anchor</template><template x-if="busy">⏳</template></button>
<template x-if="anchorId"><p class="mt-3">✔ Stored ID:
<code class="bg-gray-100 px-1 py-0.5 text-xs" x-text="anchorId"></code></p></template>
</section>

<section class="p-4 bg-white rounded shadow">
<h2 class="font-semibold mb-2">2. Verify</h2>
<input x-model="verifyId" placeholder="Paste ID" class="input border p-1 w-full mb-2"/>
<input type="file" accept="video/*" x-ref="fileVerify" class="mb-2"/>
<button class="px-4 py-1 bg-green-600 text-white rounded" @click="verify" :disabled="busy">Verify</button>
<template x-if="verifyMsg"><p class="mt-3 font-semibold"
:class="verifyOk ? 'text-green-600' : 'text-red-600'" x-text="verifyMsg"></p></template>
</section>

<template x-if="error"><p class="text-red-600 font-semibold" x-text="error"></p></template>
</div>

<script>
function ui(){
 const POST=(u,b)=>fetch(u,{method:'POST',body:b})
                    .then(r=>r.ok?r.json():r.text().then(t=>{throw new Error(t)}));
 return{
  busy:false,error:'',anchorId:'',verifyId:'',verifyMsg:'',verifyOk:false,
  async anchor(){
   this.reset();this.busy=true;
   try{
     const f=this.$refs.file.files[0]; if(!f) throw new Error('choose a video');
     const form=new FormData(); form.append('video',f);
     const {id}=await POST('/process-video',form); this.anchorId=id;
   }catch(e){this.error=e.message} finally{this.busy=false}
  },
  async verify(){
    this.error='';this.verifyMsg='';this.busy=true;
    try{
      const f=this.$refs.fileVerify.files[0]; if(!f) throw new Error('pick video');
      const form=new FormData(); form.append('id',this.verifyId.trim()); form.append('video',f);
      const {ok}=await POST('/verify-video',form);
      this.verifyOk=ok; this.verifyMsg=ok?'✓ hash matches':'✗ mismatch';
    }catch(e){this.error=e.message} finally{this.busy=false}
  },
  reset(){this.error='';this.anchorId='';}
 }
}
</script></body></html>
```

\## 6‑d Run everything

```bash
npm start                 # runs server.cjs
# open http://localhost:3000
```

Demo:

1. **Anchor** → Stored ID `1`.
2. **Verify** same file → green “✓ hash matches”.
3. Try a different file → red “✗ mismatch”.

---

# 7  Ready for the hackathon demo 🎉

* Contract, CLI, backend, and browser UI run locally with **one command**.
* No build tooling for the UI — pure CDN.
* All hashing logic and on‑chain writes use the same trusted `hash-cli`.

Print this guide or ship it in your repo’s README and any teammate can reproduce the setup from scratch in \~15 minutes.

---

\## Appendix – Full `cli/cli.ts`

*(same as §5‑d — included for copy‑paste completeness)*

```ts
#!/usr/bin/env node
import { Command }    from 'commander';
import chalk          from 'chalk';
import { hashFile }   from '../src/index.js';

import { Account }                       from '@near-js/accounts';
import { JsonRpcProvider }               from '@near-js/providers';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { KeyPairSigner }                 from '@near-js/signers';
import { KeyPair }                       from '@near-js/crypto';

const CONTRACT   = process.env.NEAR_CONTRACT ?? 'myname.testnet';
const NETWORK_ID = process.env.NEAR_NETWORK  ?? 'testnet';
const RPC_URL    = `https://rpc.${NETWORK_ID}.near.org`;
const CRED_DIR   = process.env.NEAR_CREDENTIALS_DIR ??
                   `${process.env.HOME}/.near-credentials`;

async function getAccount(): Promise<Account> {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const keyStore = new UnencryptedFileSystemKeyStore(CRED_DIR);
  const key: KeyPair | null = await keyStore.getKey(NETWORK_ID, CONTRACT);
  if (!key) throw new Error(`No key for ${CONTRACT} in ${CRED_DIR}`);
  const signer = new KeyPairSigner(key);
  return new Account(CONTRACT, provider, signer);
}

const provider = new JsonRpcProvider({ url: RPC_URL });
async function viewGetHash(id: string): Promise<string | null> {
  const res: any = await provider.query({
    request_type:'call_function',
    account_id:CONTRACT,
    method_name:'get_hash',
    args_base64:Buffer.from(JSON.stringify({id})).toString('base64'),
    finality:'optimistic'
  });
  const txt = Buffer.from(res.result as Uint8Array).toString();
  return txt || null;
}

const prog = new Command().name('hash-cli').version('0.1.0');

prog.command('anchor <file>')
 .option('-a, --algo <algo>','sha256|sha512|blake3','sha256')
 .action(async(file,opts)=>{
   const res = await hashFile(file,{algorithm:opts.algo});
   if(!res.ok){console.error(chalk.red(res.message));process.exit(2);}
   const account = await getAccount();
   const out = await account.functionCall({
     contractId:CONTRACT,methodName:'record_hash',
     args:{hash:res.hash},gas:BigInt('30000000000000'),attachedDeposit:BigInt(0)
   });
   const id64 = (out as any).status.SuccessValue ?? '';
   const id = id64?Buffer.from(id64,'base64').toString():'(unknown)';
   console.log(chalk.green(`✔ stored id ${id}`));
 });

prog.command('verify <id> <file>')
 .option('-a, --algo <algo>','sha256|sha512|blake3','sha256')
 .action(async(id,file,opts)=>{
   const res = await hashFile(file,{algorithm:opts.algo});
   if(!res.ok){console.error(chalk.red(res.message));process.exit(2);}
   const stored = await viewGetHash(id);
   if(stored===null){console.error(chalk.red(`No hash for id ${id}`));process.exit(3);}
   const ok = stored===res.hash;
   console.log(ok?chalk.green('✓ match'):chalk.red('✗ mismatch'));
   process.exit(ok?0:1);
 });

prog.parseAsync();
```

*Happy building & good luck with your presentation!*
