const SB_URL = 'https://atpuhdrlwutleynljoha.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cHVoZHJsd3V0bGV5bmxqb2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzUzNjYsImV4cCI6MjEwMjExMTM2Nn0.F7BqV6bAvqzsjgvkDw2_Aa0_JP5I0DW6FCsP2WyHbvQ';
const sb = supabase.createClient(SB_URL, SB_KEY);
const CATS = ['All', 'Street', 'Nature', 'Architecture', 'People', 'Experimental', 'Other'];
const SECRET = '#/admin';
const DEF = { u: 'harsh@owner', p: 'ThL$2024!secure' };
const HERO_FALLBACK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#0b0b0c"/><circle cx="800" cy="470" r="230" fill="none" stroke="#1c1a17" stroke-width="60"/><circle cx="800" cy="470" r="90" fill="#141210"/></svg>');

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function fmtD(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function H(s) {
  if (crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(16);
}

// Image Processing
async function procImg(file) {
  if (!file.type.startsWith('image/')) throw new Error('Not an image');
  const u = URL.createObjectURL(file);
  const img = await new Promise((r, j) => {
    const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = u;
  });
  const ratio = img.naturalWidth / img.naturalHeight;
  const rz = (mx, q) => {
    const s = Math.min(1, mx / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  };
  URL.revokeObjectURL(u);
  return { full: rz(1800, .85), thumb: rz(600, .75), ratio };
}

async function upStore(dataUrl, nm) {
  const r = await fetch(dataUrl);
  const bl = await r.blob();
  const p = `${Date.now()}_${nm}`;
  const { error } = await sb.storage.from('photos').upload(p, bl, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = sb.storage.from('photos').getPublicUrl(p);
  return publicUrl;
}

// Database Functions
const DB = {
  async photos() {
    const { data } = await sb.from('photos').select('*').order('created_at', { ascending: false });
    return data || [];
  },
  async cols() {
    const { data } = await sb.from('collections').select('*').order('created_at', { ascending: false });
    return data || [];
  },
  async cmts(pid) {
    const { data } = await sb.from('comments').select('*').eq('photo_id', pid).order('created_at');
    return data || [];
  },
  async allCmts() {
    const { data } = await sb.from('comments').select('*, photos(title)').order('created_at', { ascending: false });
    return data || [];
  },
  async delCmt(id) {
    const { error } = await sb.from('comments').delete().eq('id', id);
    if (error) throw error;
  },
  async getLike(pid) {
    const { data } = await sb.from('likes').select('count').eq('photo_id', pid).single();
    return data?.count || 0;
  },
  async addPhoto(p) {
    const { error } = await sb.from('photos').insert(p);
    if (error) throw error;
  },
  async updPhoto(id, p) {
    const { error } = await sb.from('photos').update(p).eq('id', id);
    if (error) throw error;
  },
  async delPhoto(id) {
    const { data: ph } = await sb.from('photos').select('src_url, thumb_url').eq('id', id).single();
    if (ph) {
      const ps = [ph.src_url, ph.thumb_url].map(u => { try { return u.split('/photos/')[1]; } catch { return null; } }).filter(Boolean);
      if (ps.length) await sb.storage.from('photos').remove(ps);
    }
    const { error } = await sb.from('photos').delete().eq('id', id);
    if (error) throw error;
  },
  async addCol(n) {
    const { error } = await sb.from('collections').insert({ name: n });
    if (error) throw error;
  },
  async delCol(id) {
    const { error } = await sb.from('collections').delete().eq('id', id);
    if (error) throw error;
  },
  async addCmt(pid, body) {
    const { error } = await sb.from('comments').insert({ photo_id: pid, body, author_name: 'Visitor' });
    if (error) throw error;
  },
  // Bulletproof Like Sync
  async togLike(pid, unlike) {
    try {
      if (unlike) {
        const { data } = await sb.rpc('decrement_likes', { pid: pid });
        return data || 0;
      } else {
        const { data } = await sb.rpc('increment_likes', { pid: pid });
        return data || 0;
      }
    } catch (e) {
      console.warn("DB Like sync skipped (using local only)", e);
      return null;
    }
  }
};

// Authentication
const Auth = {
  creds: null,
  async init() {
    let s = localStorage.getItem('thl_c');
    if (!s) {
      s = JSON.stringify({ uh: await H(DEF.u), ph: await H(DEF.p) });
      localStorage.setItem('thl_c', s);
    }
    this.creds = JSON.parse(s);
  },
  async verify(u, p) {
    return await H(u) === this.creds.uh && await H(p) === this.creds.ph;
  },
  async update(u, p) {
    this.creds = { uh: await H(u), ph: await H(p) };
    localStorage.setItem('thl_c', JSON.stringify(this.creds));
  },
  login() { sessionStorage.setItem('thl_s', '1'); },
  logout() { sessionStorage.removeItem('thl_s'); },
  ok() { return sessionStorage.getItem('thl_s') === '1'; }
};

// Gallery Logic
const Gal = {
  filter: 'All',
  photos: [],
  async load() {
    this.photos = await DB.photos();
    this.hero();
    this.chips();
    this.render();
  },
  hero() {
    const latest = this.photos[0];
    const img = $('#heroImg');
    if (latest) {
      img.src = latest.src_url;
      const hl = $('#heroLatest');
      hl.hidden = false;
      hl.innerHTML = '<b>Latest frame</b>' + esc(latest.title);
    } else {
      img.src = HERO_FALLBACK;
      $('#heroLatest').hidden = true;
    }
    const t = this.photos.length;
    $('#frameCount').textContent = t + ' ' + (t === 1 ? 'frame' : 'frames');
  },
  chips() {
    const ct = {};
    this.photos.forEach(p => { ct[p.category] = (ct[p.category] || 0) + 1; });
    const tot = this.photos.length;
    $('#chips').innerHTML = CATS.map(c => {
      const n = c === 'All' ? tot : (ct[c] || 0);
      if (c !== 'All' && n === 0) return '';
      return `<button class="chip${this.filter === c ? ' on' : ''}" data-c="${c}">${c} (${n})</button>`;
    }).join('');
    $('#fcount').textContent = tot + ' ' + (tot === 1 ? 'frame' : 'frames');
  },
  render() {
    const list = this.filter === 'All' ? this.photos : this.photos.filter(p => p.category === Gal.filter);
    if (!list.length) {
      $('#grid').innerHTML = '';
      $('#emptyMsg').hidden = false;
      return;
    }
    $('#emptyMsg').hidden = true;
    $('#grid').innerHTML = list.map(p => `
      <article class="ph fade-up" data-id="${p.id}">
        <img src="${p.thumb_url}" alt="${esc(p.title)}" loading="lazy" style="aspect-ratio:${p.ratio || 1}">
        <div class="ph-ov">
          <div class="ph-title">${esc(p.title)}</div>
          <div class="ph-sub">
            <span>${esc(p.category)}</span>
            <span>♥ ${p.like_count || 0}</span>
          </div>
        </div>
      </article>
    `).join('');
    observe();
  },
  init() {
    $('#chips').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (b) { this.filter = b.dataset.c; this.chips(); this.render(); }
    });
    $('#grid').addEventListener('click', e => {
      const c = e.target.closest('.ph');
      if (c) Vw.open(c.dataset.id);
    });
  }
};

// Viewer Logic
const Vw = {
  photos: [],
  idx: 0,
  async open(id) {
    const all = Gal.filter === 'All' ? Gal.photos : Gal.photos.filter(p => p.category === Gal.filter);
    this.photos = all;
    this.idx = all.findIndex(p => p.id === id);
    if (this.idx < 0) return;
    $('#vw').classList.add('open');
    document.body.classList.add('locked');
    await this.show();
  },
  close() {
    $('#vw').classList.remove('open');
    document.body.classList.remove('locked');
  },
  async nav(d) {
    if (this.photos.length < 2) return;
    this.idx = (this.idx + d + this.photos.length) % this.photos.length;
    await this.show();
  },
  async show() {
    const p = this.photos[this.idx];
    const img = $('#vImg');
    img.style.opacity = '0';
    img.onload = () => img.style.opacity = '1';
    img.src = p.src_url;
    img.alt = p.title || '';
    
    $('#vTitle').textContent = p.title || 'Untitled';
    $('#vDesc').textContent = p.description || 'No description.';
    $('#vCam').textContent = `📷 ${p.camera || 'Nikon D3500'} · ${fmtD(p.created_at)}`;
    
    // Instant LocalStorage Like Check
    const isLikedLocally = localStorage.getItem('liked_' + p.id) === 'true';
    $('#likeBtn').classList.toggle('liked', isLikedLocally);
    $('#likeN').textContent = p.like_count || 0;

    const cs = await DB.cmts(p.id);
    $('#cmtN').textContent = cs.length;
    $('#cmtList').innerHTML = cs.length ? cs.map(c => `
      <div class="cmt">
        <div class="cmt-a">${esc(c.author_name)}</div>
        <div class="cmt-t">${esc(c.body)}</div>
      </div>
    `).join('') : '<p style="color:var(--ink3);font-size:.8rem">No comments yet.</p>';
    
    if (this.photos.length > 1) {
      const nx = this.photos[(this.idx + 1) % this.photos.length];
      const pre = new Image(); pre.src = nx.src_url;
    }
  },
  init() {
    $('#vClose').onclick = () => this.close();
    $('#vPrev').onclick = () => this.nav(-1);
    $('#vNext').onclick = () => this.nav(1);
    $('#vw').onclick = e => { if (e.target === $('#vw')) this.close(); };
    
    document.addEventListener('keydown', e => {
      if (!$('#vw').classList.contains('open')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.nav(-1);
      if (e.key === 'ArrowRight') this.nav(1);
    });

    let x0 = null;
    const st = $('.vw-img');
    st.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    st.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 48) this.nav(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
    
    // BULLETPROOF LIKE BUTTON
    $('#likeBtn').onclick = async () => {
      const p = this.photos[this.idx];
      const btn = $('#likeBtn');
      const countSpan = $('#likeN');
      const isCurrentlyLiked = btn.classList.contains('liked');
      let currentCount = parseInt(countSpan.textContent) || 0;

      // 1. INSTANT UI & LOCALSTORAGE UPDATE (Never fails)
      if (isCurrentlyLiked) {
        btn.classList.remove('liked');
        countSpan.textContent = Math.max(0, currentCount - 1);
        localStorage.setItem('liked_' + p.id, 'false');
      } else {
        btn.classList.add('liked');
        countSpan.textContent = currentCount + 1;
        localStorage.setItem('liked_' + p.id, 'true');
      }

      // 2. BACKGROUND DB SYNC (Best effort, won't break UI if it fails)
      try {
        await DB.togLike(p.id, isCurrentlyLiked);
        // Re-sync with real DB count after 2 seconds
        setTimeout(async () => {
           const realCount = await DB.getLike(p.id);
           countSpan.textContent = realCount;
        }, 2000);
      } catch (err) {
        console.warn("Background DB sync skipped", err);
      }
    };

    $('#cmtBtn').onclick = () => $('#cmtInp').focus();
    $('#cmtForm').onsubmit = async e => {
      e.preventDefault();
      const inp = $('#cmtInp');
      const t = inp.value.trim();
      if (!t) return;
      await DB.addCmt(this.photos[this.idx].id, t);
      inp.value = '';
      const cs = await DB.cmts(this.photos[this.idx].id);
      $('#cmtN').textContent = cs.length;
      $('#cmtList').innerHTML = cs.map(c => `
        <div class="cmt">
          <div class="cmt-a">${esc(c.author_name)}</div>
          <div class="cmt-t">${esc(c.body)}</div>
        </div>
      `).join('');
      toast('Comment added');
    };
    $('#dlBtn').onclick = async () => {
      const p = this.photos[this.idx];
      try {
        const r = await fetch(p.src_url);
        const b = await r.blob();
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = `${(p.title || 'photo').replace(/[^a-z0-9]/gi, '_')}.jpg`;
        a.click();
        URL.revokeObjectURL(u);
        toast('Download started');
      } catch { toast('Download failed'); }
    };
  }
};

// Admin Panel Logic
const Adm = {
  pending: null,
  showLogin() {
    $('#loginBox').hidden = false;
    $('#dashBox').hidden = true;
    $('#lErr').hidden = true;
  },
  async showDash() {
    $('#loginBox').hidden = true;
    $('#dashBox').hidden = false;
    await this.stats();
    this.tab('photos');
  },
  tab(t) {
    $$('.tab').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    $('#tPhotos').hidden = t !== 'photos';
    $('#tCols').hidden = t !== 'cols';
    $('#tCmts').hidden = t !== 'cmts';
    $('#tSets').hidden = t !== 'sets';
    if (t === 'photos') this.lib();
    if (t === 'cols') this.cols();
    if (t === 'cmts') this.cmts();
  },
  async stats() {
    const ps = await DB.photos();
    const cs = await DB.cols();
    const cm = await DB.allCmts();
    $('#statsBox').innerHTML = `
      <div class="st"><b>${ps.length}</b><span>Photos</span></div>
      <div class="st"><b>${cs.length}</b><span>Collections</span></div>
      <div class="st"><b>${cm.length}</b><span>Comments</span></div>
      <div class="st"><b>${new Set(ps.map(p => p.category)).size}</b><span>Categories</span></div>
    `;
  },
  async lib() {
    const f = $('#libF').value;
    let ps = await DB.photos();
    if (f !== 'All') ps = ps.filter(p => p.category === f);
    const cs = await DB.cols();
    $('#libList').innerHTML = ps.length ? ps.map(p => {
      const col = cs.find(c => c.id === p.collection_id);
      return `
        <div class="lib-item">
          <img class="lib-thumb" src="${p.thumb_url}" loading="lazy">
          <div class="lib-info">
            <strong>${esc(p.title)}</strong>
            <span>${esc(p.category)}${col ? ' · ' + esc(col.name) : ''} · ${fmtD(p.created_at)}</span>
          </div>
          <div class="lib-acts">
            <button class="ib" data-a="ed" data-id="${p.id}"><svg width="14" height="14"><use href="#i-ed"/></svg></button>
            <button class="ib del" data-a="dl" data-id="${p.id}"><svg width="14" height="14"><use href="#i-tr"/></svg></button>
          </div>
        </div>
      `;
    }).join('') : '<p style="color:var(--ink3);padding:16px 0;font-size:.85rem">No photos yet.</p>';
  },
  async cmts() {
    const cs = await DB.allCmts();
    $('#cmtTotal').textContent = cs.length + ' total';
    $('#cmtMgrList').innerHTML = cs.length ? cs.map(c => `
      <div class="lib-item">
        <div class="lib-thumb" style="display:grid;place-items:center;font-size:18px">💬</div>
        <div class="lib-info">
          <strong>${esc(c.author_name)} <span style="font-style:normal;color:var(--ink3);font-size:.7rem">on ${esc(c.photos?.title || 'a photo')}</span></strong>
          <span style="color:var(--ink2);font-size:.82rem">${esc(c.body)}</span>
          <span>${fmtD(c.created_at)}</span>
        </div>
        <div class="lib-acts">
          <button class="ib del" data-a="dcmt" data-id="${c.id}"><svg width="14" height="14"><use href="#i-tr"/></svg></button>
        </div>
      </div>
    `).join('') : '<p style="color:var(--ink3);padding:16px 0;font-size:.85rem">No comments yet.</p>';
  },
  async cols() {
    const cs = await DB.cols();
    const ps = await DB.photos();
    $('#colList').innerHTML = cs.length ? cs.map(c => `
      <div class="col-item">
        <div>
          <div class="col-name">${esc(c.name)}</div>
          <div class="col-count">${ps.filter(p => p.collection_id === c.id).length} photos</div>
        </div>
        <button class="ib del" data-a="dc" data-id="${c.id}"><svg width="14" height="14"><use href="#i-tr"/></svg></button>
      </div>
    `).join('') : '<p style="color:var(--ink3);font-size:.85rem">No collections.</p>';
  },
  async popSel() {
    const co = CATS.filter(c => c !== 'All').map(c => `<option>${esc(c)}</option>`).join('');
    $('#uCat').innerHTML = co;
    $('#libF').innerHTML = '<option>All</option>' + co;
    const cs = await DB.cols();
    $('#uCol').innerHTML = '<option value="">None</option>' + cs.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  },
  reset() {
    this.pending = null;
    $('#fileIn').value = '';
    $('#dropPrev').hidden = true;
    $('#dropZone').style.display = '';
    $('#uBtn').disabled = true;
    $('#upForm').reset();
    $('#uCam').value = 'Nikon D3500';
  },
  modal(title, msg, fn) {
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `
      <div class="modal-box">
        <h3>${title}</h3>
        <p style="color:var(--ink2);margin-bottom:16px;font-size:.9rem">${msg}</p>
        <div class="modal-acts">
          <button class="btn btn-s" data-c>Cancel</button>
          <button class="btn btn-d" data-y>Delete</button>
        </div>
      </div>
    `;
    m.querySelector('[data-c]').onclick = () => m.remove();
    m.querySelector('[data-y]').onclick = () => { m.remove(); fn(); };
    m.onclick = e => { if (e.target === m) m.remove(); };
    $('#modalRoot').appendChild(m);
  },
  async edModal(photo) {
    const cs = await DB.cols();
    const co = '<option value="">None</option>' + cs.map(c => `<option value="${c.id}"${c.id === photo.collection_id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `
      <div class="modal-box">
        <h3>Edit Photo</h3>
        <form id="ef">
          <div class="fg"><label class="fl">Title</label><input class="fi" name="title" value="${esc(photo.title)}" required></div>
          <div class="frow">
            <div class="fg"><label class="fl">Category</label><select class="fsel" name="cat">${CATS.filter(c => c !== 'All').map(c => `<option${c === photo.category ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="fg"><label class="fl">Collection</label><select class="fsel" name="col">${co}</select></div>
          </div>
          <div class="fg"><label class="fl">Camera</label><input class="fi" name="cam" value="${esc(photo.camera || '')}"></div>
          <div class="fg"><label class="fl">Description</label><textarea class="fta" name="desc">${esc(photo.description || '')}</textarea></div>
          <div class="modal-acts">
            <button type="button" class="btn btn-s" data-c>Cancel</button>
            <button type="submit" class="btn btn-p">Save</button>
          </div>
        </form>
      </div>
    `;
    m.querySelector('[data-c]').onclick = () => m.remove();
    m.querySelector('#ef').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await DB.updPhoto(photo.id, {
        title: fd.get('title'), category: fd.get('cat'),
        collection_id: fd.get('col') || null, camera: fd.get('cam'), description: fd.get('desc')
      });
      m.remove();
      await this.lib(); await this.stats(); await Gal.load();
      toast('Updated');
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    $('#modalRoot').appendChild(m);
  },
  init() {
    $('#loginForm').onsubmit = async e => {
      e.preventDefault();
      $('#lBtn').innerHTML = '<span class="spin"></span>';
      if (await Auth.verify($('#lUser').value, $('#lPass').value)) {
        Auth.login();
        $('#lPass').value = '';
        await this.showDash();
        toast('Access granted');
      } else {
        $('#lErr').hidden = false;
      }
      $('#lBtn').textContent = 'Authenticate';
    };
    $('#logoutBtn').onclick = () => { Auth.logout(); this.showLogin(); toast('Locked'); };
    $$('.tab').forEach(t => t.onclick = () => this.tab(t.dataset.t));
    
    const z = $('#dropZone'), fi = $('#fileIn');
    z.onclick = () => fi.click();
    z.ondragover = e => { e.preventDefault(); z.classList.add('over'); };
    z.ondragleave = () => z.classList.remove('over');
    z.ondrop = e => { e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]); };
    fi.onchange = () => { if (fi.files[0]) this.handleFile(fi.files[0]); };
    
    $('#upForm').onsubmit = async e => {
      e.preventDefault();
      if (!this.pending) return;
      $('#uBtn').innerHTML = '<span class="spin"></span> Uploading...';
      try {
        const src = await upStore(this.pending.full, 'f.jpg');
        const th = await upStore(this.pending.thumb, 't.jpg');
        await DB.addPhoto({
          title: $('#uTitle').value.trim() || 'Untitled',
          category: $('#uCat').value,
          collection_id: $('#uCol').value || null,
          camera: $('#uCam').value.trim() || 'Nikon D3500',
          description: $('#uDesc').value.trim(),
          src_url: src, thumb_url: th, ratio: this.pending.ratio, like_count: 0
        });
        this.reset();
        await this.stats(); await this.lib(); await Gal.load();
        toast('Published!');
      } catch (err) { toast(err.message); }
      finally { $('#uBtn').textContent = 'Publish'; }
    };
    
    $('#libList').onclick = e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'ed') {
        DB.photos().then(ps => { const p = ps.find(x => x.id === b.dataset.id); if (p) this.edModal(p); });
      }
      if (b.dataset.a === 'dl') {
        this.modal('Delete Photo', 'This cannot be undone.', async () => {
          await DB.delPhoto(b.dataset.id);
          await this.stats(); await this.lib(); await Gal.load();
          toast('Deleted');
        });
      }
    };
    
    $('#cmtMgrList').onclick = e => {
      const b = e.target.closest('[data-a="dcmt"]');
      if (!b) return;
      this.modal('Delete Comment', 'This cannot be undone.', async () => {
        await DB.delCmt(b.dataset.id);
        await this.cmts(); await this.stats();
        toast('Comment deleted');
      });
    };
    
    $('#colForm').onsubmit = async e => {
      e.preventDefault();
      const n = $('#colName').value.trim();
      if (n) {
        await DB.addCol(n);
        $('#colName').value = '';
        await this.popSel(); await this.cols(); await this.stats();
        toast('Created');
      }
    };
    
    $('#colList').onclick = e => {
      const b = e.target.closest('[data-a="dc"]');
      if (!b) return;
      this.modal('Delete Collection', 'Photos become uncategorized.', async () => {
        await DB.delCol(b.dataset.id);
        await this.popSel(); await this.cols(); await this.stats();
        toast('Deleted');
      });
    };
    
    $('#credForm').onsubmit = async e => {
      e.preventDefault();
      if (await H($('#cOld').value) !== Auth.creds.ph) { toast('Wrong current key'); return; }
      if ($('#cPass').value.length < 6) { toast('Min 6 characters'); return; }
      await Auth.update($('#cUser').value.trim(), $('#cPass').value);
      e.target.reset();
      toast('Credentials updated');
    };
  },
  async handleFile(f) {
    try {
      const r = await procImg(f);
      this.pending = r;
      $('#dropPrev').src = r.thumb;
      $('#dropPrev').hidden = false;
      $('#dropZone').style.display = 'none';
      $('#uBtn').disabled = false;
    } catch (e) { toast(e.message); }
  }
};

// Intersection Observer for Fade Animations
const io = new IntersectionObserver(es => {
  es.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: .06 });

function observe() {
  $$('.fade-up:not(.in)').forEach(el => io.observe(el));
}

// Routing
function route() {
  const hash = location.hash || '#/';
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav a').forEach(a => a.classList.remove('active'));
  
  if (hash === SECRET) {
    $('#pgAdmin').classList.add('active');
    Auth.ok() ? Adm.showDash() : Adm.showLogin();
  } else if (hash === '#/about') {
    $('#pgAbout').classList.add('active');
    $('.nav a[data-p="about"]').classList.add('active');
    observe();
  } else {
    $('#pgHome').classList.add('active');
    $('.nav a[data-p="home"]').classList.add('active');
    Gal.load();
    observe();
  }
  window.scrollTo(0, 0);
}

function hideLoader() {
  const ld = $('#loader');
  if (!ld || ld.classList.contains('done')) return;
  ld.classList.add('locked');
  const w = $('#ldWord'); if (w) w.textContent = 'Focused';
  const b = $('#ldBar'); if (b) b.style.width = '100%';
  setTimeout(() => ld.classList.add('done'), 550);
  setTimeout(() => { if (ld.parentNode) ld.remove(); }, 1600);
}

// Initialization
(async function () {
  await Auth.init();
  window.addEventListener('scroll', () => $('#hdr').classList.toggle('scrolled', window.scrollY > 10), { passive: true });
  Gal.init(); Vw.init(); Adm.init();
  try { await Adm.popSel(); } catch (e) {}
  window.addEventListener('hashchange', route);

  // Loader Sequence
  const t0 = Date.now();
  const bar = $('#ldBar');
  if (bar) bar.style.width = '70%';
  const ready = (async () => { try { await Gal.load(); } catch (e) {} })();
  try { route(); } catch (e) {}
  await Promise.race([ready, new Promise(r => setTimeout(r, 4000))]);
  const wait = Math.max(0, 1700 - (Date.now() - t0));
  setTimeout(hideLoader, wait);
})();