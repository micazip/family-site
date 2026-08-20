/* ── State ─────────────────────────────────────────────────── */
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let selectedDay = null;
let monthEvents = [];
let galleryPhotos = [];
let diaryList = [];
let lbIndex = 0;

/* ── Navigation ────────────────────────────────────────────── */
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  sec.classList.add('active');
  // schedule은 flex로 강제 (display:block 덮어쓰기 방지)
  sec.style.display = name === 'schedule' ? 'flex' : 'block';
  const btn = document.querySelector(`[data-section="${name}"]`);
  if (btn) btn.classList.add('active');
  if (name === 'schedule') {
    renderSchedule();
    setTimeout(scrollToNow, 500);
    const dow = new Date().getDay();
    if (dow === 0 || dow === 5 || dow === 6) setTimeout(scrollToFriday, 550);
  }
}

/* ── API helpers ────────────────────────────────────────────── */
async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '오류 발생' }));
    throw new Error(err.error || '오류 발생');
  }
  return res.json();
}

/* ── Modal ──────────────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
  const form = document.querySelector(`#${id} form`);
  if (form) form.reset();
  document.getElementById('photo-preview-wrap')?.classList.add('hidden');
  document.getElementById('diary-preview-wrap')?.classList.add('hidden');
  if (id === 'modal-diary') resetRecording();
}
function closeModalOutside(e, id) {
  if (e.target.id === id) closeModal(id);
}

/* ── Image Previews ─────────────────────────────────────────── */
function previewImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const wrap = document.getElementById('photo-preview-wrap');
  const img = document.getElementById('photo-preview');
  img.src = URL.createObjectURL(file);
  wrap.classList.remove('hidden');
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  const sizeEl = document.getElementById('photo-size-hint');
  if (sizeEl) {
    sizeEl.textContent = `파일 크기: ${sizeMB}MB ${file.size > 4*1024*1024 ? '⚠️ 4MB 초과!' : '✓'}`;
    sizeEl.style.color = file.size > 4*1024*1024 ? '#e53e3e' : '#38a169';
  }
}
function previewDiaryImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const wrap = document.getElementById('diary-preview-wrap');
  const img = document.getElementById('diary-preview');
  img.src = URL.createObjectURL(file);
  wrap.classList.remove('hidden');
}

/* ─────────────────────────────────────────────────────────────
   HOME
───────────────────────────────────────────────────────────── */
async function loadHomeStats() {
  // Today's date
  const today = new Date();
  const days = ['일','월','화','수','목','금','토'];
  const dateEl = document.getElementById('home-today-date');
  if (dateEl) dateEl.textContent =
    `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일 ${days[today.getDay()]}요일`;

  try {
    const [photos, events, diaries] = await Promise.all([
      api('/api/photos'),
      api('/api/events'),
      api('/api/diaries')
    ]);
    document.getElementById('stat-photos').textContent = photos.length;
    document.getElementById('stat-events').textContent = events.length;
    document.getElementById('stat-diaries').textContent = diaries.length;
  } catch (e) { /* silent */ }
}

/* ─────────────────────────────────────────────────────────────
   GALLERY
───────────────────────────────────────────────────────────── */
async function loadGallery() {
  const grid = document.getElementById('photo-grid');
  grid.innerHTML = '<div class="empty-state">불러오는 중...</div>';
  try {
    galleryPhotos = await api('/api/photos');
    renderGallery();
  } catch (e) {
    grid.innerHTML = '<div class="empty-state">불러오기 실패 😢</div>';
  }
}

function renderGallery() {
  const grid = document.getElementById('photo-grid');
  if (!galleryPhotos.length) {
    grid.innerHTML = '<div class="empty-state">사진을 올려보세요! 📸</div>';
    return;
  }
  grid.innerHTML = galleryPhotos.map((p, i) => `
    <div class="photo-card">
      <img src="${p.file_url}" alt="${escHtml(p.caption)}" onclick="openLightbox(${i})" loading="lazy" />
      <div class="photo-info">
        <div>
          <div class="photo-caption">${escHtml(p.caption) || '&nbsp;'}</div>
          <div class="photo-meta">${p.uploaded_by ? '✦ ' + escHtml(p.uploaded_by) + ' · ' : ''}${formatDate(p.created_at)}</div>
        </div>
        <div class="btn-group">
          <button class="btn-edit" onclick="editPhoto(${p.id})">✏️ 수정</button>
          <button class="btn-danger" onclick="deletePhoto(${p.id})">삭제</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function submitPhoto(e) {
  e.preventDefault();
  const form = e.target;
  const fileInput = form.querySelector('[name="photo"]');
  const file = fileInput.files[0];
  if (file && file.size > 4 * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    alert(`사진이 너무 커요 (${sizeMB}MB).\n4MB 이하의 사진을 선택해 주세요.\n📱 사진 앱에서 '크기 줄이기'로 압축 후 올려보세요!`);
    return;
  }
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = '올리는 중...';
  try {
    await api('/api/photos', { method: 'POST', body: new FormData(form) });
    closeModal('modal-photo');
    form.reset();
    document.getElementById('photo-preview-wrap').classList.add('hidden');
    await loadGallery();
    loadHomeStats();
  } catch (err) {
    alert('사진 올리기 실패 😢\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '올리기';
  }
}

async function deletePhoto(id) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  try {
    await api(`/api/photos/${id}`, { method: 'DELETE' });
    await loadGallery();
    loadHomeStats();
  } catch (err) { alert(err.message); }
}

/* ── 사진 수정 ──────────────────────────────────────────────── */
function editPhoto(id) {
  const p = galleryPhotos.find(p => p.id === id);
  if (!p) return;
  document.getElementById('edit-photo-id').value = id;
  document.getElementById('edit-photo-caption').value = p.caption || '';
  document.getElementById('edit-photo-uploader').value = p.uploaded_by || '';
  openModal('modal-photo-edit');
}

async function submitEditPhoto(e) {
  e.preventDefault();
  const id = document.getElementById('edit-photo-id').value;
  const caption = document.getElementById('edit-photo-caption').value;
  const uploaded_by = document.getElementById('edit-photo-uploader').value;
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    await api(`/api/photos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, uploaded_by })
    });
    closeModal('modal-photo-edit');
    await loadGallery();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장하기';
  }
}

/* ── Lightbox ───────────────────────────────────────────────── */
function openLightbox(index) {
  lbIndex = index;
  updateLightbox();
  document.getElementById('lightbox').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}
function lbMove(dir) {
  lbIndex = (lbIndex + dir + galleryPhotos.length) % galleryPhotos.length;
  updateLightbox();
}
function updateLightbox() {
  const p = galleryPhotos[lbIndex];
  document.getElementById('lb-img').src = p.file_url;
  document.getElementById('lb-caption').textContent = p.caption || '';
}

/* ─────────────────────────────────────────────────────────────
   CALENDAR
───────────────────────────────────────────────────────────── */
async function loadCalendar() {
  await fetchMonthEvents();
  renderCalendar();
}

async function fetchMonthEvents() {
  try {
    monthEvents = await api(`/api/events?year=${currentYear}&month=${currentMonth}`);
  } catch (e) { monthEvents = []; }
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  selectedDay = null;
  document.getElementById('day-events').classList.add('hidden');
  loadCalendar();
}

function renderCalendar() {
  const title = document.getElementById('cal-title');
  title.textContent = `${currentYear}년 ${currentMonth}월`;

  const grid = document.getElementById('cal-grid');
  const today = new Date();
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysInPrev = new Date(currentYear, currentMonth - 1, 0).getDate();

  const eventMap = {};
  monthEvents.forEach(ev => {
    const day = parseInt(ev.event_date.split('-')[2]);
    if (!eventMap[day]) eventMap[day] = [];
    eventMap[day].push(ev);
  });

  let html = '';
  let totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dow = i % 7;
    let dayNum, otherMonth = false;
    if (i < firstDay) {
      dayNum = daysInPrev - firstDay + i + 1;
      otherMonth = true;
    } else if (i >= firstDay + daysInMonth) {
      dayNum = i - firstDay - daysInMonth + 1;
      otherMonth = true;
    } else {
      dayNum = i - firstDay + 1;
    }

    const isToday = !otherMonth &&
      dayNum === today.getDate() &&
      currentMonth === today.getMonth() + 1 &&
      currentYear === today.getFullYear();

    const isSelected = !otherMonth && dayNum === selectedDay;
    const events = !otherMonth && eventMap[dayNum] ? eventMap[dayNum] : [];

    const numClass = ['day-num', dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : ''].join(' ').trim();
    const evDots = events.map(ev =>
      `<div class="event-label" style="background:${ev.color}">${escHtml(ev.title)}</div>`
    ).join('');

    html += `
      <div class="cal-day${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}"
           onclick="${otherMonth ? '' : `selectDay(${dayNum})`}">
        <div class="${numClass}">${dayNum}</div>
        <div class="event-dots">${evDots}</div>
      </div>`;
  }
  grid.innerHTML = html;
}

function openAddEvent(dateStr) {
  document.getElementById('event-date-input').value = dateStr;
  openModal('modal-event');
}

function selectDay(day) {
  selectedDay = day;
  renderCalendar();

  const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const events = monthEvents.filter(ev => ev.event_date === dateStr);
  const panel = document.getElementById('day-events');

  if (!events.length) {
    panel.innerHTML = `
      <h4>📅 ${currentMonth}월 ${day}일 — 일정 없음</h4>
      <button class="btn-primary btn-sm" onclick="openAddEvent('${dateStr}')">+ 이 날 일정 추가</button>`;
  } else {
    panel.innerHTML = `
      <h4>📅 ${currentMonth}월 ${day}일 일정 (${events.length}개)</h4>
      ${events.map(ev => `
        <div class="event-item">
          <div class="event-color-bar" style="background:${ev.color}"></div>
          <div class="event-info">
            <strong>${escHtml(ev.title)}</strong>
            ${ev.description ? `<p>${escHtml(ev.description)}</p>` : ''}
            ${ev.created_by ? `<small>✦ ${escHtml(ev.created_by)}</small>` : ''}
          </div>
          <div class="btn-group">
            <button class="btn-edit btn-sm" onclick="editEvent(${ev.id})">✏️ 수정</button>
            <button class="btn-danger" onclick="deleteEvent(${ev.id})">삭제</button>
          </div>
        </div>
      `).join('')}
      <div style="margin-top:10px">
        <button class="btn-primary btn-sm" onclick="openAddEvent('${dateStr}')">+ 일정 추가</button>
      </div>`;
  }
  panel.classList.remove('hidden');
}

async function submitEvent(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    const data = Object.fromEntries(new FormData(form));
    await api('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    closeModal('modal-event');
    await loadCalendar();
    if (selectedDay) selectDay(selectedDay);
    loadHomeStats();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '추가하기';
  }
}

async function deleteEvent(id) {
  if (!confirm('이 일정을 삭제할까요?')) return;
  try {
    await api(`/api/events/${id}`, { method: 'DELETE' });
    await loadCalendar();
    if (selectedDay) selectDay(selectedDay);
    loadHomeStats();
  } catch (err) { alert(err.message); }
}

/* ── 일정 수정 ──────────────────────────────────────────────── */
function editEvent(id) {
  const ev = monthEvents.find(e => e.id === id);
  if (!ev) return;
  document.getElementById('edit-event-id').value = id;
  document.getElementById('edit-event-title').value = ev.title || '';
  document.getElementById('edit-event-date').value = ev.event_date || '';
  document.getElementById('edit-event-desc').value = ev.description || '';
  document.getElementById('edit-event-creator').value = ev.created_by || '';
  document.querySelectorAll('input[name="edit-color"]').forEach(r => {
    r.checked = r.value === ev.color;
  });
  openModal('modal-event-edit');
}

async function submitEditEvent(e) {
  e.preventDefault();
  const id = document.getElementById('edit-event-id').value;
  const title = document.getElementById('edit-event-title').value;
  const event_date = document.getElementById('edit-event-date').value;
  const description = document.getElementById('edit-event-desc').value;
  const created_by = document.getElementById('edit-event-creator').value;
  const colorEl = document.querySelector('input[name="edit-color"]:checked');
  const color = colorEl ? colorEl.value : '#FF7A5A';
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    await api(`/api/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, event_date, created_by, color })
    });
    closeModal('modal-event-edit');
    await loadCalendar();
    if (selectedDay) selectDay(selectedDay);
    loadHomeStats();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장하기';
  }
}

/* ─────────────────────────────────────────────────────────────
   DIARY
───────────────────────────────────────────────────────────── */
async function loadDiary() {
  const list = document.getElementById('diary-list');
  list.innerHTML = '<div class="empty-state">불러오는 중...</div>';
  try {
    diaryList = await api('/api/diaries');
    if (!diaryList.length) {
      list.innerHTML = '<div class="empty-state">첫 번째 일기를 써보세요! ✏️</div>';
      return;
    }
    list.innerHTML = diaryList.map(d => `
      <div class="diary-card">
        <div class="diary-card-body">
          ${d.file_url ? `<img class="diary-thumb" src="${d.file_url}" alt="" />` : ''}
          <div class="diary-text" onclick="viewDiary(${d.id})">
            <h3>${escHtml(d.title)}</h3>
            <p class="diary-excerpt">${escHtml(d.content)}</p>
          </div>
        </div>
        <div class="diary-footer">
          <span class="diary-meta">
            ${d.written_by ? '✦ ' + escHtml(d.written_by) + ' · ' : ''}${formatDate(d.created_at)}
          </span>
          <div class="btn-group">
            <button class="btn-edit" onclick="editDiary(${d.id})">✏️ 수정</button>
            <button class="btn-danger" onclick="deleteDiary(${d.id})">삭제</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">불러오기 실패 😢</div>';
  }
}

/* ── Voice Recording ─────────────────────────────────────────── */
let _mediaRecorder = null;
let _audioChunks = [];
let _recInterval = null;
let _recSecs = 0;
let _recordedBlob = null;

function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('이 브라우저는 녹음을 지원하지 않습니다.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      _audioChunks = [];
      _recSecs = 0;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      _mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
      _mediaRecorder.onstop = () => {
        _recordedBlob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(_recordedBlob);
        const preview = document.getElementById('rec-preview');
        preview.src = url;
        preview.classList.remove('hidden');
        document.getElementById('btn-rec-reset').classList.remove('hidden');
        stream.getTracks().forEach(t => t.stop());
      };
      _mediaRecorder.start(200);
      document.getElementById('btn-rec-start').classList.add('hidden');
      document.getElementById('rec-active-ui').classList.remove('hidden');
      _recInterval = setInterval(() => {
        _recSecs++;
        const m = String(Math.floor(_recSecs / 60)).padStart(2, '0');
        const s = String(_recSecs % 60).padStart(2, '0');
        document.getElementById('rec-timer').textContent = `${m}:${s}`;
      }, 1000);
    })
    .catch(() => alert('마이크 접근 권한이 필요합니다.\n브라우저 설정에서 마이크를 허용해 주세요.'));
}

function stopRecording() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    _mediaRecorder.stop();
    clearInterval(_recInterval);
    document.getElementById('btn-rec-start').classList.remove('hidden');
    document.getElementById('rec-active-ui').classList.add('hidden');
  }
}

function resetRecording() {
  stopRecording();
  _recordedBlob = null;
  const preview = document.getElementById('rec-preview');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  document.getElementById('btn-rec-reset')?.classList.add('hidden');
  document.getElementById('btn-rec-start')?.classList.remove('hidden');
  document.getElementById('rec-timer') && (document.getElementById('rec-timer').textContent = '00:00');
}

async function submitDiary(e) {
  e.preventDefault();
  const form = e.target;
  const fileInput = form.querySelector('[name="photo"]');
  const file = fileInput && fileInput.files[0];
  if (file && file.size > 4 * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    alert(`첨부 사진이 너무 커요 (${sizeMB}MB).\n4MB 이하의 사진을 선택해 주세요!`);
    return;
  }
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    const fd = new FormData(form);
    // Upload audio if recorded
    if (_recordedBlob) {
      btn.textContent = '녹음 저장 중...';
      const audioFd = new FormData();
      const ext = (_mediaRecorder?.mimeType || '').includes('ogg') ? '.ogg' : '.webm';
      audioFd.append('audio', _recordedBlob, `rec-${Date.now()}${ext}`);
      const audioRes = await api('/api/diaries/audio', { method: 'POST', body: audioFd });
      if (audioRes.url) fd.append('audio_url', audioRes.url);
      btn.textContent = '저장 중...';
    }
    await api('/api/diaries', { method: 'POST', body: fd });
    closeModal('modal-diary');
    form.reset();
    document.getElementById('diary-preview-wrap').classList.add('hidden');
    await loadDiary();
    loadHomeStats();
  } catch (err) {
    alert('일기 저장 실패 😢\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '저장하기';
  }
}

async function deleteDiary(id) {
  if (!confirm('이 일기를 삭제할까요?')) return;
  try {
    await api(`/api/diaries/${id}`, { method: 'DELETE' });
    await loadDiary();
    loadHomeStats();
  } catch (err) { alert(err.message); }
}

async function viewDiary(id) {
  try {
    const d = diaryList.find(x => x.id === id);
    if (!d) return;
    document.getElementById('diary-view-title').textContent = d.title;
    document.getElementById('diary-view-content').innerHTML = `
      ${d.file_url ? `<img src="${d.file_url}" alt="" />` : ''}
      ${d.audio_url ? `<div class="dv-audio"><span class="dv-audio-label">🎙️ 녹음</span><audio src="${d.audio_url}" controls></audio></div>` : ''}
      <div class="dv-meta">
        ${d.written_by ? '✦ ' + escHtml(d.written_by) + ' · ' : ''}${formatDate(d.created_at)}
      </div>
      <div class="dv-body">${escHtml(d.content)}</div>
      <div style="margin-top:16px">
        <button class="btn-edit" onclick="closeModal('modal-diary-view'); editDiary(${d.id})">✏️ 수정하기</button>
      </div>
    `;
    openModal('modal-diary-view');
  } catch (e) { alert('불러오기 실패'); }
}

/* ── 일기 수정 ──────────────────────────────────────────────── */
function editDiary(id) {
  const d = diaryList.find(d => d.id === id);
  if (!d) return;
  document.getElementById('edit-diary-id').value = id;
  document.getElementById('edit-diary-title').value = d.title || '';
  document.getElementById('edit-diary-content').value = d.content || '';
  document.getElementById('edit-diary-writer').value = d.written_by || '';
  openModal('modal-diary-edit');
}

async function submitEditDiary(e) {
  e.preventDefault();
  const id = document.getElementById('edit-diary-id').value;
  const title = document.getElementById('edit-diary-title').value;
  const content = document.getElementById('edit-diary-content').value;
  const written_by = document.getElementById('edit-diary-writer').value;
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    await api(`/api/diaries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, written_by })
    });
    closeModal('modal-diary-edit');
    await loadDiary();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장하기';
  }
}

/* ── Keyboard shortcuts ─────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-photo','modal-event','modal-diary','modal-diary-view',
     'modal-photo-edit','modal-event-edit','modal-diary-edit'].forEach(closeModal);
    closeLightbox();
  }
  if (!document.getElementById('lightbox').classList.contains('hidden')) {
    if (e.key === 'ArrowLeft') lbMove(-1);
    if (e.key === 'ArrowRight') lbMove(1);
  }
});

/* ── Utils ──────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(dt) {
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

/* ─────────────────────────────────────────────────────────────
   SCHEDULE (민서 시간표)
───────────────────────────────────────────────────────────── */
const SCHED_COLORS = {
  school:  { bg: '#B0B0B0', text: '#000' },
  korean:  { bg: '#D4EDAA', text: '#000' },
  english: { bg: '#FFCC88', text: '#000' },
  math:    { bg: '#FFF59D', text: '#000' },
  self:    { bg: '#C9B8F0', text: '#000' },
  meal:    { bg: '#9DC3E6', text: '#000' },
  free:    { bg: '#EBEBEB', text: '#000' },
  after:   { bg: '#FFD6E8', text: '#000' },
  mint:    { bg: '#B2EBE0', text: '#000' },
};

/* 방학 중이면 true, 개학하면 false로 바꾸면 학기 시간표로 복귀 */
const IS_VACATION = false;

const SCHEDULE_DATA_SEMESTER = [
  // 월요일
  [
    { s:'08:20', e:'09:10', label:'인지A',     type:'school', period:'1교시' },
    { s:'09:20', e:'10:10', label:'세계사',    type:'school', period:'2교시' },
    { s:'10:20', e:'11:10', label:'미적1',     type:'school', period:'3교시' },
    { s:'11:20', e:'12:10', label:'독서토론',  type:'school', period:'4교시' },
    { s:'12:10', e:'13:10', label:'점심',      type:'meal' },
    { s:'13:10', e:'14:00', label:'영2',       type:'school', period:'5교시' },
    { s:'14:10', e:'15:00', label:'공강',      type:'free',   period:'6교시' },
    { s:'15:10', e:'16:00', label:'사문',      type:'school', period:'7교시' },
    { s:'16:30', e:'17:40', label:'자율학습',  type:'self' },
    { s:'17:40', e:'19:40', label:'급식&이동', type:'meal' },
    { s:'19:40', e:'22:00', label:'영어',      type:'english', note:'22:00 영어끝' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 화요일
  [
    { s:'08:20', e:'09:10', label:'사문',      type:'school', period:'1교시' },
    { s:'09:20', e:'10:10', label:'영2',       type:'school', period:'2교시' },
    { s:'10:20', e:'11:10', label:'인지B',     type:'school', period:'3교시' },
    { s:'11:20', e:'12:10', label:'화법',      type:'school', period:'4교시' },
    { s:'12:10', e:'13:10', label:'점심',      type:'meal' },
    { s:'13:10', e:'14:00', label:'스과',      type:'school', period:'5교시' },
    { s:'14:10', e:'15:00', label:'독서토론',  type:'school', period:'6교시' },
    { s:'15:10', e:'16:00', label:'미적1',     type:'school', period:'7교시' },
    { s:'16:30', e:'17:40', label:'자율학습',  type:'self' },
    { s:'17:40', e:'18:40', label:'급식',      type:'meal' },
    { s:'18:40', e:'22:00', label:'자율학습',  type:'self', note:'22:00 학교' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 수요일
  [
    { s:'08:20', e:'09:10', label:'현윤',      type:'school', period:'1교시' },
    { s:'09:20', e:'10:10', label:'음악',      type:'school', period:'2교시' },
    { s:'10:20', e:'11:10', label:'진로2',     type:'school', period:'3교시' },
    { s:'11:20', e:'12:10', label:'영2',       type:'school', period:'4교시' },
    { s:'12:10', e:'13:10', label:'점심',      type:'meal' },
    { s:'13:10', e:'14:00', label:'세계사',    type:'school', period:'5교시' },
    { s:'14:10', e:'15:00', label:'자율',      type:'mint',   period:'6교시' },
    { s:'15:10', e:'16:00', label:'자율',      type:'mint',   period:'7교시' },
    { s:'16:30', e:'17:40', label:'방과후',    type:'after' },
    { s:'17:40', e:'19:00', label:'급식&이동', type:'meal' },
    { s:'19:00', e:'20:40', label:'국어',      type:'korean', note:'20:40 한은정' },
    { s:'21:10', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 목요일
  [
    { s:'08:20', e:'09:10', label:'현윤',      type:'school', period:'1교시' },
    { s:'09:20', e:'10:10', label:'미적1',     type:'school', period:'2교시' },
    { s:'10:20', e:'11:10', label:'공강',      type:'free',   period:'3교시' },
    { s:'11:20', e:'12:10', label:'음악',      type:'school', period:'4교시' },
    { s:'12:10', e:'13:10', label:'점심',      type:'meal' },
    { s:'13:10', e:'14:00', label:'화법',      type:'school', period:'5교시' },
    { s:'14:10', e:'15:00', label:'영2',       type:'school', period:'6교시' },
    { s:'15:10', e:'16:00', label:'사문',      type:'school', period:'7교시' },
    { s:'16:30', e:'17:40', label:'방과후',    type:'after' },
    { s:'17:40', e:'18:40', label:'급식',      type:'meal' },
    { s:'18:40', e:'22:00', label:'자율학습',  type:'self', note:'22:00 학교' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 금요일
  [
    { s:'08:20', e:'09:10', label:'미적1',     type:'school', period:'1교시' },
    { s:'09:20', e:'10:10', label:'독서토론',  type:'school', period:'2교시' },
    { s:'10:20', e:'11:10', label:'인지A',     type:'school', period:'3교시' },
    { s:'11:20', e:'12:10', label:'세계사',    type:'school', period:'4교시' },
    { s:'12:10', e:'13:10', label:'점심',      type:'meal' },
    { s:'13:10', e:'14:00', label:'화법',      type:'school', period:'5교시' },
    { s:'14:10', e:'15:00', label:'현윤',      type:'school', period:'6교시' },
    { s:'15:10', e:'17:30', label:'자율학습',  type:'self' },
    { s:'17:30', e:'18:30', label:'식사&이동', type:'meal' },
    { s:'18:30', e:'22:00', label:'수학',      type:'math', note:'22:00 매쓰메카' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 토요일
  [
    { s:'08:30', e:'09:30', label:'식사&준비', type:'meal' },
    { s:'09:30', e:'12:30', label:'자율학습',  type:'self' },
    { s:'12:30', e:'13:30', label:'식사&이동', type:'meal' },
    { s:'13:30', e:'15:30', label:'영어',      type:'english', note:'15:30 영어끝' },
    { s:'15:30', e:'17:00', label:'자율학습',  type:'self' },
    { s:'17:00', e:'18:00', label:'식사&이동', type:'meal' },
    { s:'18:00', e:'21:00', label:'국어',      type:'korean', note:'21:00 한은정' },
    { s:'21:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 일요일
  [
    { s:'08:30', e:'09:30', label:'식사&준비', type:'meal' },
    { s:'09:30', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'18:00', label:'수학',      type:'math', note:'18:00 매쓰메카' },
    { s:'18:00', e:'20:00', label:'식사',      type:'meal' },
    { s:'20:00', e:'24:00', label:'자율학습',  type:'self' },
  ],
];

const SCHEDULE_DATA_VACATION = [
  // 월요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'17:20', label:'자율학습',  type:'self' },
    { s:'17:30', e:'18:30', label:'식사&이동', type:'meal' },
    { s:'18:30', e:'22:00', label:'수학',      type:'math', note:'22:00 매쓰메카' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 화요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'18:20', label:'자율학습',  type:'self' },
    { s:'18:20', e:'19:20', label:'식사&이동', type:'meal' },
    { s:'19:20', e:'22:00', label:'영어',      type:'english', note:'22:00 영어끝' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 수요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'19:10', label:'자율학습',  type:'self' },
    { s:'19:10', e:'20:20', label:'식사',      type:'meal' },
    { s:'20:20', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 목요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'19:10', label:'자율학습',  type:'self' },
    { s:'19:10', e:'20:20', label:'식사',      type:'meal' },
    { s:'20:20', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 금요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'17:20', label:'자율학습',  type:'self' },
    { s:'17:30', e:'18:30', label:'식사&이동', type:'meal' },
    { s:'18:30', e:'22:00', label:'수학',      type:'math', note:'22:00 매쓰메카' },
    { s:'22:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 토요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'17:00', label:'영어',      type:'english', note:'17:00 영어끝' },
    { s:'17:30', e:'19:00', label:'자율학습',  type:'self' },
    { s:'19:00', e:'20:30', label:'식사',      type:'meal' },
    { s:'20:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
  // 일요일
  [
    { s:'08:30', e:'10:00', label:'식사&준비', type:'meal' },
    { s:'10:00', e:'13:30', label:'자율학습',  type:'self' },
    { s:'13:30', e:'14:30', label:'식사&이동', type:'meal' },
    { s:'14:30', e:'18:00', label:'수학',      type:'math', note:'18:00 매쓰메카' },
    { s:'18:30', e:'19:30', label:'자율학습',  type:'self' },
    { s:'19:30', e:'20:30', label:'식사',      type:'meal' },
    { s:'20:30', e:'24:00', label:'자율학습',  type:'self' },
  ],
];

const SCHEDULE_DATA = IS_VACATION ? SCHEDULE_DATA_VACATION : SCHEDULE_DATA_SEMESTER;

const SCHED_DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const SCHED_START_H = 8;   // 08:00
const PX_PM = 1.3;          // pixels per minute

function _toY(t) {
  const [h, m] = t.split(':').map(Number);
  return (h * 60 + m - SCHED_START_H * 60) * PX_PM;
}
function _dur(s, e) {
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) * PX_PM;
}
function _fmtHM(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`;
}

let schedRendered = false;
function renderSchedule() {
  if (schedRendered) return;
  schedRendered = true;

  const startMin = SCHED_START_H * 60;
  const endMin = 24 * 60;
  const totalH = (endMin - startMin) * PX_PM + 75; // 시작→24:00 + 하단 여백

  let html = `<div class="sch-inner" style="height:${totalH}px">`;

  // ── Time axis (정시만 라벨: 08:00~24:00) ────────────────────
  html += '<div class="sch-axis">';
  for (let m = startMin; m <= endMin; m += 60) {
    const y = (m - startMin) * PX_PM;
    const isLast = m === endMin;
    const shift  = isLast ? 'translateY(-100%)' : 'translateY(-50%)';
    html += `<div class="sch-time-lbl" style="top:${y}px;transform:${shift}">${_fmtHM(m)}</div>`;
  }
  html += '</div>';

  // ── Current day index (월=0 … 일=6) ──────────────────────
  const _now = new Date();
  const todayIdx = (_now.getDay() + 6) % 7; // JS 0=Sun → index 6
  const nowMins  = _now.getHours() * 60 + _now.getMinutes();
  const inRange  = nowMins >= SCHED_START_H * 60 && nowMins <= 24 * 60;

  // ── Day columns ────────────────────────────────────────────
  SCHED_DAYS.forEach((day, di) => {
    const isSat = di === 5, isSun = di === 6;
    html += `<div class="sch-col${isSat ? ' col-sat' : isSun ? ' col-sun' : ''}">`;
    html += `<div class="sch-col-hdr${isSat ? ' hdr-sat' : isSun ? ' hdr-sun' : ''}">${day}</div>`;
    html += `<div class="sch-col-body" style="height:${totalH}px">`;

    // Grid lines: 30분 단위 (정시=hr-line, 30분=hf-line)
    for (let m = startMin; m <= endMin; m += 30) {
      const y = (m - startMin) * PX_PM;
      html += m % 60 === 0
        ? `<div class="sch-hr-line" style="top:${y}px"></div>`
        : `<div class="sch-hf-line" style="top:${y}px"></div>`;
    }

    // Schedule blocks
    SCHEDULE_DATA[di].forEach(b => {
      const top = _toY(b.s), hpx = _dur(b.s, b.e);
      const c = SCHED_COLORS[b.type] || SCHED_COLORS.free;
      const borderColor = b.note ? _darken(c.bg, 0.28) : '';
      const noteStyle = b.note ? `;box-shadow:0 0 0 2.5px ${borderColor} inset;cursor:pointer` : '';
      const style = `top:${top}px;height:${hpx}px;background:${c.bg};color:${c.text}${noteStyle}`;
      const clickAttr = b.note ? `onclick="showSticker('${b.note}','${c.bg}','${borderColor}')"` : '';
      html += `<div class="sch-block" ${clickAttr} style="${style}">`;
      if (b.period) html += `<span class="sch-prd">${b.period}</span>`;
      html += `<span class="sch-subj">${b.label}</span>`;
      if (hpx > 38) html += `<span class="sch-tr">${b.s}~${b.e}</span>`;
      if (b.note) html += `<span class="sch-note-dot" style="color:${borderColor}">●</span>`;
      html += '</div>';
    });

    // Current time indicator — today's column only
    if (di === todayIdx && inRange) {
      const nowY = (nowMins - SCHED_START_H * 60) * PX_PM;
      const hhmm = `${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
      html += `<div class="sch-now-line" style="top:${nowY}px"><span class="sch-now-badge">${hhmm}</span></div>`;
    }

    html += '</div></div>';
  });

  html += '</div>';
  document.getElementById('schedule-grid').innerHTML = html;

  // 요일 헤더("월화수목...") 높이만큼 축에 여백을 줘서 축과 칸의 시간이 어긋나지 않게 정렬
  const colHdr = document.querySelector('.sch-col-hdr');
  const axis = document.querySelector('.sch-axis');
  if (colHdr && axis) axis.style.marginTop = colHdr.offsetHeight + 'px';

  // 금/토/일이면 금요일 컬럼부터 보이도록 가로 스크롤
  const _dow = _now.getDay();
  if (_dow === 0 || _dow === 5 || _dow === 6) setTimeout(scrollToFriday, 200);

  // Update current time indicator every minute
  setInterval(() => {
    const el = document.querySelector('.sch-now-line');
    if (!el) return;
    const n = new Date();
    const nm = n.getHours() * 60 + n.getMinutes();
    const ny = (nm - SCHED_START_H * 60) * PX_PM;
    el.style.top = ny + 'px';
    const badge = el.querySelector('.sch-now-badge');
    if (badge) badge.textContent = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }, 60000);
}

/* ── Schedule Scroll ────────────────────────────────────────── */
function scrollToNow() {
  const wrap = document.querySelector('.schedule-grid-wrap');
  if (!wrap) return;
  const n = new Date();
  const nm = n.getHours() * 60 + n.getMinutes();
  if (nm < SCHED_START_H * 60 || nm > 24 * 60) return;
  const nowY = (nm - SCHED_START_H * 60) * PX_PM;
  // getBoundingClientRect로 실제 화면에 보이는 높이 사용
  const h = wrap.getBoundingClientRect().height || window.innerHeight * 0.7;
  wrap.scrollTop = Math.max(0, nowY - h * 0.5);
}

function scrollToFriday(retries) {
  if (retries === undefined) retries = 15;
  requestAnimationFrame(() => {
    const wrap = document.querySelector('.schedule-grid-wrap');
    if (!wrap) return;
    const cols = wrap.querySelectorAll('.sch-col');
    if (!cols.length && retries > 0) { setTimeout(() => scrollToFriday(retries - 1), 100); return; }
    const friCol = cols[4]; // 금요일 = index 4
    if (!friCol) return;
    const axisW = 48;
    wrap.scrollTo({ left: Math.max(0, friCol.offsetLeft - axisW), behavior: 'smooth' });
  });
}

/* ── Sticker ────────────────────────────────────────────────── */
function _darken(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
  const g = Math.max(0, ((n >>  8) & 255) * (1 - amt));
  const b = Math.max(0, ( n        & 255) * (1 - amt));
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function showSticker(text, bgColor, borderColor) {
  const existing = document.getElementById('sticker-popup');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'sticker-popup';
  el.className = 'sticker-popup';
  el.textContent = text;
  if (bgColor) el.style.background = bgColor;
  if (borderColor) el.style.border = `2px solid ${borderColor}`;
  if (bgColor) el.style.color = '#222';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('sticker-show'), 10);
  setTimeout(() => {
    el.classList.remove('sticker-show');
    setTimeout(() => el.remove(), 400);
  }, 2000);
}

/* ── Hero Photo ─────────────────────────────────────────────── */
async function loadHeroPhoto() {
  try {
    const settings = await api('/api/settings');
    if (settings.hero_url) {
      const img = document.getElementById('hero-bg');
      img.src = settings.hero_url;
      img.classList.remove('hidden');
      img.onload = () => {
        const ov = document.querySelector('.fullhero-overlay');
        if (ov) ov.style.background =
          'linear-gradient(175deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.82) 100%)';
      };
    }
  } catch (_) {}
}

async function uploadHeroPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    alert('8MB 이하의 사진을 선택해 주세요!'); return;
  }
  const btn = document.getElementById('hero-photo-btn');
  if (btn) { btn.style.opacity = '0.5'; btn.disabled = true; }
  try {
    const fd = new FormData();
    fd.append('photo', file);
    const result = await api('/api/settings/hero', { method: 'POST', body: fd });
    const img = document.getElementById('hero-bg');
    img.src = result.url + '?t=' + Date.now();
    img.classList.remove('hidden');
    const ov = document.querySelector('.fullhero-overlay');
    if (ov) ov.style.background =
      'linear-gradient(175deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.82) 100%)';
  } catch (err) {
    alert('업로드 실패: ' + err.message);
  } finally {
    if (btn) { btn.style.opacity = ''; btn.disabled = false; }
    e.target.value = '';
  }
}


/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadHomeStats();
  // schedule 섹션 flex 강제 적용
  const schedSec = document.getElementById('section-schedule');
  if (schedSec) schedSec.style.display = 'flex';
  renderSchedule();
  setTimeout(scrollToNow, 800);
  const dow = new Date().getDay();
  if (dow === 0 || dow === 5 || dow === 6) setTimeout(scrollToFriday, 850);
});
