/*───────────────────────────────────────────────────────────────────────────
  ProofCam backend  –  CommonJS (.cjs) for simplicity with "type":"module"
───────────────────────────────────────────────────────────────────────────*/
require('dotenv').config();

const express   = require('express');
const multer    = require('multer');
const fs        = require('fs');
const path      = require('path');
const ffmpeg    = require('fluent-ffmpeg');
const { MerkleTree } = require('merkletreejs');
const Keccak    = require('keccak');
const keccak256 = (buf) => Keccak('keccak256').update(buf).digest();
const crypto    = require('crypto');
const os        = require('os');

/* If you installed `ffmpeg-static`, point fluent‑ffmpeg to it so the
   binary is always found even on hosts without a system ffmpeg.     */
try {
  ffmpeg.setFfmpegPath(require('ffmpeg-static'));
} catch { /* optional – ignore if package not installed */ }

/*─────────────────────  NEAR v2 helpers  ───────────────────────*/
const { UnencryptedFileSystemKeyStore } = require('@near-js/keystores-node');
const { JsonRpcProvider }               = require('@near-js/providers');
const { Account }                       = require('@near-js/accounts');
const { KeyPairSigner }                 = require('@near-js/signers');
const { KeyPair }                       = require('@near-js/crypto');

const NETWORK_ID   = 'testnet';
const RPC_URL      = `https://rpc.${NETWORK_ID}.near.org`;
const CONTRACT_ID  = 'cj4.testnet';     // process.env.CONTRACT_NAME || 'cj4.testnet';     // must expose store_proof / get_proof
const ACCOUNT_ID   = process.env.NEAR_ACCOUNT_ID;   // signer account
const PRIVATE_KEY  = process.env.NEAR_PRIVATE_KEY;  // optional if key file exists
const CRED_DIR     = process.env.NEAR_CREDENTIALS_DIR
                   ?? `${os.homedir()}/.near-credentials`;

const provider = new JsonRpcProvider({ url: RPC_URL });

async function getAccount () {
  const fsStore = new UnencryptedFileSystemKeyStore(CRED_DIR);
  if (PRIVATE_KEY) {
    await fsStore.setKey(NETWORK_ID, ACCOUNT_ID, KeyPair.fromString(PRIVATE_KEY));
  }
  const signer = new KeyPairSigner(await fsStore.getKey(NETWORK_ID, ACCOUNT_ID));
  return new Account(ACCOUNT_ID, provider, signer);
}

async function storeProofOnNear (videoId, root) {
  const account = await getAccount();
  await account.functionCall({
    contractId      : CONTRACT_ID,
    methodName      : 'store_proof',
    args            : { video_id: videoId, merkle_root: root },
    gas             : BigInt('30000000000000'),
    attachedDeposit : BigInt(0)
  });
}

async function fetchProof (videoId) {
  const res = await provider.query({
    request_type : 'call_function',
    account_id   : CONTRACT_ID,
    method_name  : 'get_proof',
    args_base64  : Buffer.from(JSON.stringify({ video_id: videoId })).toString('base64'),
    finality     : 'optimistic'
  });
  const txt = Buffer.from(res.result).toString();
  return txt === '' ? null : JSON.parse(txt);
}

/*─────────────────────  Express app  ───────────────────────────*/
const app  = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

/* uploads */
const upload = multer({ dest: 'uploads/' });
for (const d of ['uploads', 'frames']) if (!fs.existsSync(d)) fs.mkdirSync(d);

/*──────────  /process-video  — hash & anchor  ──────────*/
app.post('/process-video', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const videoId   = crypto.randomBytes(16).toString('hex');
  const frameDir  = path.join('frames', videoId);
  fs.mkdirSync(frameDir, { recursive: true });

  try {
    /* 1 · extract frames */
    await new Promise((ok, fail) =>
      ffmpeg(req.file.path)
        .on('end', ok)
        .on('error', fail)
        .save(path.join(frameDir, 'frame-%04d.png'))
    );

    /* 2 · hash frames → Merkle root */
    const leaves = fs.readdirSync(frameDir).sort()
                     .map(f => keccak256(fs.readFileSync(path.join(frameDir, f))));
    const tree   = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root   = tree.getRoot().toString('hex');

    /* 3 · anchor root on‑chain */
    await storeProofOnNear(videoId, root);

    res.json({ videoId, merkleRoot: root, frameCount: leaves.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

/*──────────  /verify-video  — rehash & compare  ──────────*/
app.post('/verify-video', upload.single('video'), async (req, res) => {
  const { videoId } = req.body;
  if (!videoId || !req.file)
    return res.status(400).json({ error: 'videoId and video required' });

  const frameDir = path.join('frames', `verify-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(frameDir);

  try {
    /* 1 · extract frames from uploaded clip */
    await new Promise((ok, fail) =>
      ffmpeg(req.file.path)
        .on('end', ok)
        .on('error', fail)
        .save(path.join(frameDir, 'frame-%04d.png'))
    );

    /* 2 · local Merkle root */
    const leaves = fs.readdirSync(frameDir).sort()
                     .map(f => keccak256(fs.readFileSync(path.join(frameDir, f))));
    const tree   = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const localRoot = tree.getRoot().toString('hex');

    /* 3 · fetch on‑chain root */
    const chainRoot = await fetchProof(videoId);
    if (chainRoot === null)
      return res.status(404).json({ error: 'no proof on chain', ok: false });

    /* 4 · compare */
    const ok = chainRoot === localRoot;
    res.json({ ok, chainRoot, localRoot });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlinkSync(req.file.path);
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
});

/* start */
app.listen(port, () =>
  console.log(`ProofCam backend + static UI → http://localhost:${port}`)
);
