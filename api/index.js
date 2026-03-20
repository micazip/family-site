const express = require('express');
const { put, list, del } = require('@vercel/blob');
const multer = require('multer');
const path = require('path');
const app = express();

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 업로드 가능합니다.'));
  }
});

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') cb(null, true);
    else cb(new Error('오디오 파일만 업로드 가능합니다.'));
  }
});

// ── JSON-in-Blob database ────────────────────────────────────
async function readDB(name) {
  try {
    const { blobs } = await list({ prefix: `db/${name}.json` });
    if (!blobs.length) return [];
    // cache-bust to avoid stale CDN responses
    const r = await fetch(blobs[0].url + '?t=' + Date.now());
    return await r.json();
  } catch (e) {
    return [];
  }
}

async function writeDB(name, data) {
  await put(`db/${name}.json`, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json'
  });
}

function newId() { return Date.now() + Math.floor(Math.random() * 1000); }

// ── SETTINGS (hero image etc.) ───────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const raw = await readDB('settings');
    res.json(Array.isArray(raw) ? {} : raw);
  } catch (e) { res.json({}); }
});

app.post('/api/settings/hero', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const ext = path.extname(req.file.originalname);
    const blobName = `settings/hero-${Date.now()}${ext}`;
    const { url } = await put(blobName, req.file.buffer, { access: 'public' });
    const raw = await readDB('settings');
    const settings = Array.isArray(raw) ? {} : raw;
    // delete old hero if exists
    if (settings.hero_url) { try { await del(settings.hero_url); } catch (_) {} }
    settings.hero_url = url;
    await writeDB('settings', settings);
    res.json({ url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PHOTOS ──────────────────────────────────────────────────
app.put('/api/photos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { caption = '', uploaded_by = '' } = req.body;
    const photos = await readDB('photos');
    const idx = photos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: '없음' });
    photos[idx] = { ...photos[idx], caption, uploaded_by };
    await writeDB('photos', photos);
    res.json(photos[idx]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/photos', async (req, res) => {
  try {
    const photos = await readDB('photos');
    res.json(photos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const { caption = '', uploaded_by = '' } = req.body;
    const ext = path.extname(req.file.originalname);
    const blobName = `photos/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { url } = await put(blobName, req.file.buffer, { access: 'public' });
    const photos = await readDB('photos');
    const item = { id: newId(), file_url: url, caption, uploaded_by, created_at: new Date().toISOString() };
    photos.push(item);
    await writeDB('photos', photos);
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/photos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const photos = await readDB('photos');
    const photo = photos.find(p => p.id === id);
    if (!photo) return res.status(404).json({ error: '없음' });
    try { await del(photo.file_url); } catch (_) {}
    await writeDB('photos', photos.filter(p => p.id !== id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EVENTS ──────────────────────────────────────────────────
app.put('/api/events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description = '', event_date, created_by = '', color = '#FF7A5A' } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: '제목과 날짜는 필수입니다.' });
    const events = await readDB('events');
    const idx = events.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: '없음' });
    events[idx] = { ...events[idx], title, description, event_date, created_by, color };
    await writeDB('events', events);
    res.json(events[idx]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/events', async (req, res) => {
  try {
    let events = await readDB('events');
    const { year, month } = req.query;
    if (year && month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      events = events.filter(e => e.event_date.startsWith(prefix));
    }
    events.sort((a, b) => a.event_date.localeCompare(b.event_date));
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/events', async (req, res) => {
  try {
    const { title, description = '', event_date, created_by = '', color = '#FF7A5A' } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: '제목과 날짜는 필수입니다.' });
    const events = await readDB('events');
    const item = { id: newId(), title, description, event_date, created_by, color, created_at: new Date().toISOString() };
    events.push(item);
    await writeDB('events', events);
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const events = await readDB('events');
    await writeDB('events', events.filter(e => e.id !== id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DIARIES ─────────────────────────────────────────────────

// Audio upload for diaries
app.post('/api/diaries/audio', uploadAudio.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const ext = path.extname(req.file.originalname) || '.webm';
    const blobName = `diaries/audio-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { url } = await put(blobName, req.file.buffer, { access: 'public', contentType: req.file.mimetype || 'audio/webm' });
    res.json({ url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/diaries/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, content, written_by = '', audio_url } = req.body;
    if (!title || !content) return res.status(400).json({ error: '제목과 내용은 필수입니다.' });
    const diaries = await readDB('diaries');
    const idx = diaries.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: '없음' });
    diaries[idx] = { ...diaries[idx], title, content, written_by, ...(audio_url !== undefined && { audio_url }) };
    await writeDB('diaries', diaries);
    res.json(diaries[idx]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/diaries', async (req, res) => {
  try {
    const diaries = await readDB('diaries');
    res.json(diaries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/diaries', upload.single('photo'), async (req, res) => {
  try {
    const { title, content, written_by = '' } = req.body;
    if (!title || !content) return res.status(400).json({ error: '제목과 내용은 필수입니다.' });
    let file_url = '';
    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const blobName = `diaries/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const blob = await put(blobName, req.file.buffer, { access: 'public' });
      file_url = blob.url;
    }
    const diaries = await readDB('diaries');
    const { audio_url = '' } = req.body;
    const item = { id: newId(), title, content, file_url, audio_url, written_by, created_at: new Date().toISOString() };
    diaries.push(item);
    await writeDB('diaries', diaries);
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/diaries/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const diaries = await readDB('diaries');
    const diary = diaries.find(d => d.id === id);
    if (!diary) return res.status(404).json({ error: '없음' });
    if (diary.file_url)  { try { await del(diary.file_url);  } catch (_) {} }
    if (diary.audio_url) { try { await del(diary.audio_url); } catch (_) {} }
    await writeDB('diaries', diaries.filter(d => d.id !== id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
