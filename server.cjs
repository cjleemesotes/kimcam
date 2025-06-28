// ───────────────────────────────────────────────────────────────────
// ProofCam MVP backend
// * POST /process-video  – anchors video hash via `hash-cli anchor`
// * POST /verify-video   – checks hash via `hash-cli verify`
// * Serves static UI from ./public
// ───────────────────────────────────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const { execFile } = require('child_process');

// ─── Express setup ────────────────────────────────────────────────
const app  = express();
const port = 3000;

// static UI  →  http://localhost:3000/index.html
app.use(express.static(path.join(__dirname, 'public')));

// uploads →  ./uploads/ (created if missing)
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ─── /process-video  (anchor) ─────────────────────────────────────
app.post('/process-video', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  execFile('hash-cli', ['anchor', req.file.path], (err, stdout, stderr) => {
    fs.unlinkSync(req.file.path);                     // cleanup temp upload

    if (err) {
      console.error(stderr || err);
      return res.status(500).json({ error: 'anchor failed' });
    }

    const id = stdout.match(/stored id (\d+)/i)?.[1] ?? '(unknown)';
    return res.json({ id });
  });
});

// ─── /verify-video  (rehash & compare) ────────────────────────────
app.post('/verify-video', upload.single('video'), (req, res) => {
  const { id } = req.body;
  if (!id || !req.file) return res.status(400).json({ error: 'id and video required' });

  execFile('hash-cli', ['verify', id, req.file.path], (err) => {
    fs.unlinkSync(req.file.path);
    res.json({ ok: !err });                 // exit‑code 0 ⇒ match
  });
});

// ─── Start server ────────────────────────────────────────────────
app.listen(port, () =>
  console.log(`ProofCam backend + static UI on  http://localhost:${port}`)
);
