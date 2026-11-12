/* AP2-Simulator – Weboberfläche (ohne Build-Schritt). Gestaltung: Hallmark, Theme Vantage, Akzent IHK-Blau. */
(() => {
  'use strict';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const app = $('#app');
  const setSave = (t) => { const el = $('#save-state'); if (el) el.textContent = t; };
  const state = { exams: null, topics: null, timer: null, view: null };
  // Eigene Einstellungen (Notenrechner, Prüfungstermin, Rechentrainer); Änderungen lösen die Speicherdatei aus
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event('ap2:changed')); } catch (e) { toast('Der Browser-Speicher ist voll', true); } },
  };

  // ---------- Hilfsfunktionen ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  const fmtPts = (p) => (p === undefined || p === null) ? '–' : (Number.isInteger(+p) ? String(p) : String(+p).replace('.', ','));
  const ptsLabel = (p) => `${fmtPts(p)} ${+p === 1 ? 'Punkt' : 'Punkte'}`;
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const kindLabel = (k) => ({ Teil1: 'Teil 1: Installation und Service', Teil2: 'Teil 2: Stromversorgung', WiSo: 'Teil 3: Wirtschafts- und Sozialkunde', AP1: 'AP1: Einrichten eines IT-gestützten Arbeitsplatzes' }[k] || k);
  const kindShort = (k) => ({ Teil1: 'Teil 1', Teil2: 'Teil 2', WiSo: 'WiSo', AP1: 'AP1' }[k] || k);
  const seasonLabel = (e) => e.season === 'Winter' ? `Winter ${e.year}/${String(e.year + 1).slice(2)}` : e.season === 'Beispiel' ? `Beispielaufgaben ${e.year}` : `${e.season} ${e.year}`;
  const gradeFor = (pct) => pct >= 92 ? 1 : pct >= 81 ? 2 : pct >= 67 ? 3 : pct >= 50 ? 4 : pct >= 30 ? 5 : 6;
  const examKind = (e) => e.id.startsWith('thema-') ? 'topic' : e.origin === 'generated' ? 'gen' : e.parts.length === 1 && e.parts[0].kind === 'WiSo' ? 'wiso' : 'real';
  // Originalprüfungen: notes sind Transkriptionsnotizen; angezeigt werden nur Termin und fehlende Teile
  const examNote = (e) => {
    if (examKind(e) !== 'real') return e.notes || '';
    if (e.parts.some((p) => p.kind === 'AP1')) return 'Beispielaufgaben zu Teil 1 der Abschlussprüfung (AP1) für alle IT-Berufe, Institut für Bildungsanalysen Baden-Württemberg, mit Lösungsvorschlägen.';
    const date = ((e.notes || '').match(/^Prüfungstermin [^(]*\([^)]*\)\./) || [''])[0];
    const missing = [['Teil1', 'Teil 1 (Installation und Service)'], ['Teil2', 'Teil 2 (Stromversorgung)']].filter(([k]) => !e.parts.some((p) => p.kind === k)).map(([, l]) => l);
    return [date, missing.length ? `${missing.join(' und ')} liegt für diesen Termin nicht als Aufgabensatz vor.` : ''].filter(Boolean).join(' ');
  };
  const examName = (e) => examKind(e) === 'real' && e.season === 'Beispiel' ? 'AP1 Beispielaufgaben (Baden-Württemberg)' : examKind(e) === 'real' ? `Abschlussprüfung ${seasonLabel(e)}` : examKind(e) === 'wiso' ? `WiSo ${seasonLabel(e)}` : e.title;
  const sessionHref = (s) => `#/${s.finished ? 'result' : (s.mode === 'exam' ? 'exam' : 'learn')}/${s.id}`;
  // Früher Server-PDF, jetzt Druckansicht im Browser („Drucken“ → „Als PDF speichern“)
  const pdfLink = (href, label) => {
    let m = href.match(/^\/api\/exams\/([^/]+)\/pdf\?(.*)$/);
    if (m) return `<a class="btn sm quiet" href="#/print/${m[1]}?${m[2]}">${label}</a>`;
    m = href.match(/^\/api\/sessions\/([^/]+)\/pdf\?(.*)$/);
    if (m) return `<a class="btn sm quiet" href="#/print-session/${m[1]}?${m[2]}">${label}</a>`;
    return `<a class="btn sm quiet" target="_blank" rel="noopener" href="${href}">${label}</a>`;
  };

  // Alle Daten laufen über das Browser-Backend (local.js): pro Person im eigenen Browser gespeichert.
  async function api(path, opts = {}) {
    return window.AP2Local.handle(opts.method || 'GET', path, opts.body ? JSON.parse(opts.body) : null);
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

  let toastTimer = null;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2500);
  }

  // ---------- Dialog ----------
  let lastFocus = null;
  function openModal(html, wide) {
    if ($('#modal').hidden) lastFocus = document.activeElement;
    $('#modal-body').innerHTML = html;
    $('#modal-card').classList.toggle('wide', !!wide);
    $('#modal-card').classList.toggle('viewer', wide === 'viewer');
    $('#modal').hidden = false;
    const f = $('#modal-body [autofocus]') || $('#modal-body button, #modal-body a, #modal-body input') || $('.modal-close');
    if (f) f.focus({ preventScroll: true });
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modal-body').innerHTML = '';
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  // ---------- Dokumentbetrachter (wie ein PDF-Viewer): alle Seiten untereinander, Zoomleiste oben ----------
  const ZOOM_STEPS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 300, 400];
  const icon = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  function docViewer(host, pages, opts = {}) {
    const st = store.get('ap2.settings', {});
    let zoom = opts.zoom || st.viewerZoom || 'width';
    const n = pages.length;
    host.innerHTML = `<div class="dv${opts.inline ? ' inline' : ''}">
      <div class="dv-bar" role="toolbar" aria-label="Seitenansicht">
        ${opts.title ? `<h2 class="dv-title" id="${opts.inline ? 'dv-title' : 'modal-title'}">${esc(opts.title)}</h2>` : ''}
        <div class="dv-group">
          <button type="button" class="btn icon-btn" data-dv="prev" aria-label="Vorherige Seite" title="Vorherige Seite">${icon('<path d="M15 18l-6-6 6-6"/>')}</button>
          <label class="dv-pageno"><span class="visually-hidden">Seite</span><input class="input num" type="text" inputmode="numeric" value="1" aria-label="Seite, Eingabe springt" data-dv="page"><span class="small muted">/ ${n}</span></label>
          <button type="button" class="btn icon-btn" data-dv="next" aria-label="Nächste Seite" title="Nächste Seite">${icon('<path d="M9 18l6-6-6-6"/>')}</button>
        </div>
        <div class="dv-group">
          <button type="button" class="btn icon-btn" data-dv="out" aria-label="Verkleinern" title="Verkleinern (Strg und Mausrad)">${icon('<path d="M5 12h14"/>')}</button>
          <label><span class="visually-hidden">Zoom</span><select class="input dv-zoom" data-dv="zoom"><option value="fit">Ganze Seite</option><option value="width">Seitenbreite</option>${ZOOM_STEPS.map((z) => `<option value="${z}">${z} %</option>`).join('')}</select></label>
          <button type="button" class="btn icon-btn" data-dv="in" aria-label="Vergrößern" title="Vergrößern (Strg und Mausrad)">${icon('<path d="M12 5v14M5 12h14"/>')}</button>
        </div>
        <button type="button" class="btn icon-btn" data-dv="download" aria-label="Als PDF herunterladen" title="Als PDF herunterladen">${icon('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>')}</button>
        <button type="button" class="btn icon-btn" data-dv="print" aria-label="Alle Seiten drucken" title="Alle Seiten drucken oder als PDF speichern">${icon('<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1"/><path d="M7 14h10v7H7z"/>')}</button>
        ${opts.inline ? '' : '<button type="button" class="btn sm dv-close" data-close>Schließen</button>'}
      </div>
      <div class="dv-scroll" tabindex="0" aria-label="${esc(opts.title || 'Seiten')}">
        <div class="dv-pages">${pages.map((p, i) => `<div class="dv-page" data-i="${i}"><img data-src="${esc(p)}" alt="Seite ${i + 1} von ${n}" draggable="false"></div>`).join('')}</div>
      </div>
    </div>`;
    const sc = $('.dv-scroll', host), wrap = $('.dv-pages', host), sel = $('[data-dv="zoom"]', host), pin = $('[data-dv="page"]', host);
    const pageEls = $$('.dv-page', host);
    const PAD = 16, BASE = 794; // 100 % = A4-Breite bei 96 dpi wie in Acrobat
    // aspect-ratio kommt als „827 / 1169“ zurück
    const ratio = () => { const m = getComputedStyle(pageEls[cur()] || pageEls[0]).aspectRatio.match(/([\d.]+)\s*\/\s*([\d.]+)/); return m ? m[1] / m[2] : 0.7072; };
    const width = () => {
      const w = sc.clientWidth - 2 * PAD;
      if (zoom === 'width') return Math.max(120, w);
      if (zoom === 'fit') return Math.max(120, Math.min(w, (sc.clientHeight - 2 * PAD) * ratio()));
      return BASE * zoom / 100;
    };
    const pct = () => Math.round(width() / BASE * 100);
    const showZoom = () => {
      const v = String(zoom); let o = [...sel.options].find((x) => x.value === v);
      $$('option[data-custom]', sel).forEach((x) => { if (x !== o) x.remove(); });
      if (!o) { o = new Option(`${zoom} %`, v); o.dataset.custom = '1'; sel.add(o, sel.options[2]); }
      sel.value = v;
    };
    const apply = (keep = true) => {
      const fy = keep && sc.scrollHeight ? sc.scrollTop / sc.scrollHeight : 0, fx = keep && sc.scrollWidth > sc.clientWidth ? (sc.scrollLeft + sc.clientWidth / 2) / sc.scrollWidth : 0.5;
      wrap.style.setProperty('--pw', `${width()}px`);
      if (keep) { sc.scrollTop = fy * sc.scrollHeight; sc.scrollLeft = fx * sc.scrollWidth - sc.clientWidth / 2; }
      showZoom();
    };
    const setZoom = (z) => { zoom = z; const s2 = store.get('ap2.settings', {}); s2.viewerZoom = z; store.set('ap2.settings', s2); apply(); };
    const step = (dir) => {
      const p = pct(); const next = dir > 0 ? ZOOM_STEPS.find((z) => z > p) : [...ZOOM_STEPS].reverse().find((z) => z < p);
      if (next) setZoom(next);
    };
    const cur = () => { const y = sc.scrollTop + sc.clientHeight * 0.3; let i = 0; pageEls.forEach((el, k) => { if (el.offsetTop <= y) i = k; }); return i; };
    const go = (i) => { i = Math.min(n - 1, Math.max(0, i)); sc.scrollTop = pageEls[i].offsetTop - PAD; pin.value = i + 1; };
    // Seitenbilder erst laden, wenn sie in die Nähe kommen; Seitenverhältnis aus dem Bild übernehmen (Querformat)
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return; const img = en.target; io.unobserve(img);
      window.AP2Local.pageSrc(img.dataset.src).then((u) => { img.onload = () => { if (img.naturalWidth) { img.parentElement.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; if (zoom === 'fit') apply(); } }; img.src = u; }).catch(() => { img.alt = 'Seite konnte nicht geladen werden'; });
    }), { root: sc, rootMargin: '1500px 0px' });
    $$('.dv-page img', host).forEach((img) => io.observe(img));
    let raf = 0;
    sc.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (document.activeElement !== pin) pin.value = cur() + 1; }); });
    sc.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    sc.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { step(1); e.preventDefault(); }
      else if (e.key === '-') { step(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(cur() + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(cur() - 1); e.preventDefault(); }
      else if (e.key === 'Home') { go(0); e.preventDefault(); }
      else if (e.key === 'End') { go(n - 1); e.preventDefault(); }
    });
    $('[data-dv="prev"]', host).onclick = () => go(cur() - 1);
    $('[data-dv="next"]', host).onclick = () => go(cur() + 1);
    $('[data-dv="in"]', host).onclick = () => step(1);
    $('[data-dv="print"]', host).onclick = () => printPages(pages, opts.printTitle || opts.title || 'Seiten');
    $('[data-dv="download"]', host).onclick = () => downloadPages(pages, opts.printTitle || opts.title || 'Seiten');
    $('[data-dv="out"]', host).onclick = () => step(-1);
    sel.onchange = () => setZoom(/^\d+$/.test(sel.value) ? +sel.value : sel.value);
    pin.onchange = () => { const v = parseInt(pin.value, 10); if (v) go(v - 1); else pin.value = cur() + 1; };
    pin.onkeydown = (e) => { if (e.key === 'Enter') pin.onchange(); };
    // Größe des Bereichs ändert sich (Fenster, Seitenleiste): Ganze Seite und Seitenbreite neu berechnen
    const ro = new ResizeObserver(() => { if (!document.body.contains(sc)) { ro.disconnect(); return; } if (typeof zoom === 'string') apply(); });
    ro.observe(sc);
    apply(false);
    if (opts.start) requestAnimationFrame(() => go(opts.start));
    return { go };
  }
  // Seiten drucken: alle Seitenbilder entschlüsseln, je Seite ein A4-Blatt, dann Druckdialog (auch „Als PDF speichern“)
  let printing = false;
  async function printPages(pages, title) {
    if (printing || !pages || !pages.length) return;
    printing = true;
    const box = document.createElement('div'); box.id = 'print-pages';
    box.innerHTML = pages.map((p, i) => `<figure class="pp"><img alt="Seite ${i + 1}"></figure>`).join('');
    document.body.appendChild(box);
    const imgs = [...box.querySelectorAll('img')]; let n = 0;
    toast(`Seiten werden für den Druck vorbereitet (0 von ${pages.length})`);
    try {
      await Promise.all(pages.map((p, i) => window.AP2Local.pageSrc(p).then((u) => new Promise((res, rej) => {
        imgs[i].onload = () => { n++; if (n % 5 === 0 || n === pages.length) toast(`Seiten werden für den Druck vorbereitet (${n} von ${pages.length})`); res(); };
        imgs[i].onerror = () => rej(new Error(`Seite ${i + 1} konnte nicht geladen werden`));
        imgs[i].src = u;
      }))));
    } catch (e) { toast(e.message, true); box.remove(); printing = false; return; }
    const oldTitle = document.title; document.title = title; // Dateiname beim Speichern als PDF
    // ohne Rand: keine Kopf- und Fußzeile des Browsers, die Scanseite füllt das Blatt; quer gescannte Seiten bekommen ein Querformat-Blatt
    const pageCss = document.createElement('style');
    pageCss.textContent = '@page { margin: 0; }';
    document.head.appendChild(pageCss);
    document.body.classList.add('printing-pages');
    const done = () => { document.body.classList.remove('printing-pages'); box.remove(); pageCss.remove(); document.title = oldTitle; printing = false; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }
  // Kleines PDF ohne Bibliothek: je Seite ein JPEG-Bild auf A4 (hoch oder quer), Bild eingepasst
  function pdfFromJpegs(imgs) {
    const enc = new TextEncoder(), parts = [], offs = [];
    let len = 0;
    const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body, stream) => { offs[n] = len; put(`${n} 0 obj\n${body}\n`); if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); } put('endobj\n'); };
    put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    const kids = imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${imgs.length} >>`);
    imgs.forEach((im, i) => {
      const n = 3 + i * 3, land = im.w > im.h, W = land ? 842 : 595, H = land ? 595 : 842;
      const s = Math.min(W / im.w, H / im.h), w = im.w * s, h = im.h * s, x = (W - w) / 2, y = (H - h) / 2;
      const content = enc.encode(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
      obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
      obj(n + 1, `<< /Length ${content.length} >>`, content);
      obj(n + 2, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`, im.data);
    });
    const count = 3 + imgs.length * 3, xref = len;
    put(`xref\n0 ${count}\n0000000000 65535 f \n${offs.slice(1, count).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
    put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let p = 0; parts.forEach((b) => { out.set(b, p); p += b.length; });
    return out;
  }
  const loadImg = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Seite konnte nicht geladen werden')); im.src = u; });
  // Handschrift (Striche in Seitenanteilen) auf eine eigene Ebene, damit Radieren nur Tinte entfernt, nicht den Scan
  function inkLayer(strokes, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-pen').trim() || 'navy';
    strokes.forEach((s) => {
      g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; g.lineWidth = W * (s.erase ? 0.022 : 0.0022);
      g.beginPath(); s.pts.forEach((p, i) => { if (i) g.lineTo(p[0] * W, p[1] * H); else g.moveTo(p[0] * W, p[1] * H); }); if (s.pts.length === 1) g.lineTo(s.pts[0][0] * W + 1, s.pts[0][1] * H);
      g.stroke();
    });
    return c;
  }
  let downloading = false;
  const fileSafe = (s) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const saveBlob = (blob, name) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };
  // inks: je Seite die Striche, die darauf gezeichnet werden (ausgefüllte Prüfung)
  async function downloadPages(pages, title, inks) {
    if (downloading || !pages || !pages.length) return;
    downloading = true;
    try {
      let n = 0;
      saveBlob(new Blob([await pagesPdf(pages, inks, () => toast(`PDF wird erstellt (${++n} von ${pages.length} Seiten)`))], { type: 'application/pdf' }), `${fileSafe(title)}.pdf`);
      toast(`PDF mit ${pages.length} Seiten heruntergeladen`);
    } catch (e) { toast(e.message, true); }
    downloading = false;
  }
  async function pagesPdf(pages, inks, progress) {
      const imgs = await pool(6, pages, async (src, i) => {
        const u = await window.AP2Local.pageSrc(src);
        const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`Seite ${i + 1} konnte nicht geladen werden`)); im.src = u; });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
        if (inks && inks[i] && inks[i].length) g.drawImage(inkLayer(inks[i], c.width, c.height), 0, 0);
        const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
        progress();
        return { w: c.width, h: c.height, data: new Uint8Array(await blob.arrayBuffer()) };
      });
      return pdfFromJpegs(imgs);
  }
  const { crc32, zipBlob, pool } = window.AP2Local;
  const zipCache = new Map(); // fertige ZIPs bis zum Neuladen der Seite, ein zweiter Klick speichert sofort
  // list: [Pfad im ZIP ohne .pdf, Seitenliste]; gleiche Pfade bekommen eine Nummer
  async function downloadZip(list, title) {
    if (downloading || !list.length) return;
    downloading = true;
    try {
      const key = `${title}|${list.length}`;
      if (!zipCache.has(key)) {
        const seen = {}, total = list.reduce((n, [, p]) => n + p.length, 0); let done = 0;
        const named = list.map(([path, pages]) => { const n = (seen[path] = (seen[path] || 0) + 1); return [`${fileSafe(title)}/${path}${n > 1 ? ` (${n})` : ''}.pdf`, pages]; });
        const files = await pool(2, named, async ([path, pages]) => {
          const data = await pagesPdf(pages, null, () => toast(`ZIP wird erstellt (${++done} von ${total} Seiten)`));
          return { path, crc: crc32(data), size: data.length, blob: new Blob([data]) };
        });
        zipCache.set(key, { blob: zipBlob(files), n: files.length });
      }
      const z = zipCache.get(key);
      saveBlob(z.blob, `${fileSafe(title)}.zip`);
      toast(`ZIP mit ${z.n} PDFs heruntergeladen`);
    } catch (e) { toast(e.message, true); }
    downloading = false;
  }
  function pageViewer(pages, start = 0, title = 'Originalseiten') {
    if (!pages || !pages.length) { toast('Keine Seitenbilder vorhanden', true); return; }
    openModal('<div id="dv-host" class="dv-host"></div>', 'viewer');
    docViewer($('#dv-host'), pages, { title, start });
    $('#dv-host .dv-scroll').focus({ preventScroll: true });
  }

  async function loadExams(force) {
    if (!state.exams || force) state.exams = await api('/api/exams');
    return state.exams;
  }
  async function loadTopics() {
    if (!state.topics) state.topics = await api('/api/topics');
    return state.topics;
  }

  // ---------- Hülle: Navigation, Menü, Darstellung ----------
  function setNav(name) {
    $$('.nav a').forEach((a) => { if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    closeMenu();
  }
  function closeMenu() { $('#topbar').removeAttribute('data-open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  $('#menu-btn').onclick = () => {
    const open = !$('#topbar').hasAttribute('data-open');
    $('#topbar').toggleAttribute('data-open', open);
    $('#menu-btn').setAttribute('aria-expanded', String(open));
  };
  const MODES = ['auto', 'light', 'dark'];
  const MODE_NAMES = { auto: 'Auto', light: 'Hell', dark: 'Dunkel' };
  function applyMode(m) {
    if (m === 'auto') delete document.documentElement.dataset.mode; else document.documentElement.dataset.mode = m;
    try { if (m === 'auto') localStorage.removeItem('ap2-mode'); else localStorage.setItem('ap2-mode', m); } catch (e) { /* privater Modus */ }
    $('#mode-btn').querySelectorAll('svg').forEach((s) => s.toggleAttribute('hidden', s.dataset.m !== m));
    $('#mode-btn').setAttribute('aria-label', `Darstellung: ${MODE_NAMES[m]}. Klicken zum Wechseln`);
    $('#mode-btn').title = `Darstellung: ${MODE_NAMES[m]}`;
  }
  applyMode(document.documentElement.dataset.mode || 'auto');
  $('#mode-btn').onclick = () => applyMode(MODES[(MODES.indexOf(document.documentElement.dataset.mode || 'auto') + 1) % 3]);

  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    $('#timerbox').hidden = true;
  }

  // ---------- Router ----------
  const routes = [
    [/^#?\/?$/, home],
    [/^#\/exams(?:\/(real|wiso|gen|topic))?$/, examsView],
    [/^#\/exam-detail\/([^/]+)$/, examDetail],
    [/^#\/generate$/, generateView],
    [/^#\/(?:topics|wiki)$/, wikiIndex],
    [/^#\/wiki\/thema\/([a-z0-9-]+)$/, wikiThema],
    [/^#\/wiki\/artikel\/([a-z0-9.&-]+)$/, wikiArtikel],
    [/^#\/formeln$/, formulasView],
    [/^#\/stats(?:\/(verlauf|daten))?$/, statsView],
    [/^#\/noten$/, gradesView],
    [/^#\/rechnen$/, drillView],
    [/^#\/fragen$/, quizView],
    [/^#\/projekt(?:\/(antrag|doku|praes|fg))?$/, projectView],
    [/^#\/archive(?:\/([a-z0-9-]+))?$/, archiveView],
    [/^#\/learn\/([^/]+)$/, learnView],
    [/^#\/exam\/([^/]+)$/, examView],
    [/^#\/result\/([^/]+)$/, resultView],
    [/^#\/original\/([^/?]+)$/, originalView],
    [/^#\/print\/([^/?]+)(?:\?(.*))?$/, (id, q) => printView(id, null, q)],
    [/^#\/print-session\/([^/?]+)(?:\?(.*))?$/, (sid, q) => printView(null, sid, q)],
  ];
  const errorState = (title, msg) => `<div class="state"><h2>${esc(title)}</h2><p>${esc(msg)}</p><p class="actions" style="margin-top:var(--space-md)"><a class="btn" href="#/">Zur Startseite</a></p></div>`;
  async function route() {
    const hash = location.hash || '#/';
    stopTimer();
    closeMenu();
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) {
        app.innerHTML = '<div class="state" aria-busy="true"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:55%"></div></div>';
        try { await fn(...m.slice(1)); } catch (e) { app.innerHTML = errorState('Das hat nicht geklappt', e.message + '. Läuft der Simulator noch? Seite neu laden oder zur Startseite wechseln.'); }
        window.scrollTo(0, 0);
        return;
      }
    }
    app.innerHTML = errorState('Seite nicht gefunden', 'Diese Adresse gibt es im Simulator nicht.');
  }
  window.addEventListener('hashchange', route);

  // ---------- Reiter innerhalb eines Bereichs (statt eigener Menüpunkte) ----------
  // Ankreuzlisten der Projektseite: große Zeilen zum Antippen, darüber der Stand „3 von 10“
  const checklistHtml = (items, key, state) => `<div class="check-head"><span class="check-count" aria-live="polite"></span><span class="meter"><span></span></span></div><div class="checklist">${items.map((c, i) => `<label class="check"><input type="checkbox" data-${key}="${i}"${state[i] ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>`;
  const checkCounts = () => $$('.check-head', app).forEach((h) => {
    const c = $$('input', h.nextElementSibling); const n = c.filter((x) => x.checked).length;
    $('.check-count', h).textContent = n === c.length ? `Alles erledigt, ${n} von ${c.length}` : `${n} von ${c.length} erledigt`;
    h.classList.toggle('done', n === c.length); $('.meter > span', h).style.width = `${Math.round(100 * n / c.length)}%`;
  });
  const subnav = (items, cur) => `<nav class="subnav" aria-label="Bereich">${items.map(([k, label, href]) => `<a href="${href}"${k === cur ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
  const EXAM_TABS = [['exams', 'Prüfungen', '#/exams'], ['generate', 'Generator', '#/generate']];
  const WIKI_TABS = [['wiki', 'Themen und Artikel', '#/topics'], ['formeln', 'Formelsammlung', '#/formeln']];
  const PJ_TABS = [['start', 'Überblick', '#/projekt'], ['antrag', 'Antrag', '#/projekt/antrag'], ['doku', 'Dokumentation', '#/projekt/doku'], ['praes', 'Präsentation', '#/projekt/praes'], ['fg', 'Fachgespräch', '#/projekt/fg']];
  const STATS_TABS = [['ueberblick', 'Überblick', '#/stats'], ['verlauf', 'Verlauf', '#/stats/verlauf'], ['noten', 'Notenrechner', '#/noten'], ['daten', 'Deine Daten', '#/stats/daten']];

  // ---------- Startseite ----------
  async function home() {
    setNav('home');
    const [status, exams, sessions, prog] = await Promise.all([api('/api/status'), loadExams(true), api('/api/sessions'), api('/api/progress')]);
    const open = sessions.filter((s) => !s.finished).slice(0, 3);
    const itse = exams.filter((e) => examKind(e) === 'real');
    const gen = exams.filter((e) => examKind(e) === 'gen');
    app.innerHTML = `
      <div class="page-head home-head"><div>
        <h1>AP2-Simulator für IT-System-Elektroniker/-in</h1>
        <p class="lede">Echte IHK-Prüfungen im Lernmodus mit Hilfestufen üben oder mit Zeitlimit als Prüfung schreiben.</p>
      </div></div>
      ${todayHtml(prog, sessions)}
      <div class="split even">
        <section class="sheet" aria-labelledby="start-h">
          <h2 id="start-h">Prüfung wählen</h2>
          <div class="field" style="margin-top:var(--space-md)"><span>Prüfungstermin</span>
            <select class="input" id="h-exam">${itse.map((e) => `<option value="${e.id}">${esc(examName(e))}</option>`).join('')}${gen.length ? `<optgroup label="Generierte Prüfungen">${gen.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('')}</optgroup>` : ''}</select>
          </div>
          <div class="actions" style="margin-top:var(--space-md)">
            <button type="button" class="btn primary" id="h-learn">Lernmodus starten</button>
            <button type="button" class="btn" id="h-exam-start">Prüfung simulieren</button>
            <a class="btn quiet" id="h-detail" href="#/exam-detail/${itse[0] ? itse[0].id : ''}">Details und PDF</a>
          </div>
        </section>
        <section class="sheet" aria-labelledby="open-h">
          <h2 id="open-h">Weitermachen</h2>
          ${open.length ? `<ul class="todo" style="margin-top:var(--space-sm)">${open.map((s2) => `<li><span><a class="row-title" href="${sessionHref(s2)}">${esc(s2.exam_title.replace(/\s*[–-]\s*IT-System-Elektroniker\/-in$/, ''))}</a><br><span class="small muted">${s2.mode === 'exam' ? 'Prüfung' : 'Lernen'}, ${fmtDate(s2.created_at)}, ${s2.answered} ${s2.answered === 1 ? 'Antwort' : 'Antworten'}</span></span><span class="actions"><a class="btn sm" href="${sessionHref(s2)}">Fortsetzen</a><button type="button" class="btn sm quiet" data-del-session="${s2.id}">Löschen</button></span></li>`).join('')}</ul>`
            : '<p class="empty">Keine offene Sitzung.</p>'}
          <p class="small" style="margin-top:var(--space-sm)"><a href="#/stats/verlauf">Alle Sitzungen</a></p>
        </section>
      </div>
      ${status.warnings.length ? `<section class="section"><details class="disc"><summary>${status.warnings.length} Datenhinweise</summary><div class="disc-body"><ul class="small">${status.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></details></section>` : ''}`;
    bindToday();
    const sel = $('#h-exam');
    const syncDetail = () => { $('#h-detail').href = `#/exam-detail/${sel.value}`; };
    sel.onchange = syncDetail;
    $('#h-learn').onclick = () => startDialog(sel.value, 'learn');
    $('#h-exam-start').onclick = () => startDialog(sel.value, 'exam');
    $$('[data-del-session]', app).forEach((b) => b.onclick = async () => {
      if (!confirm('Sitzung wirklich löschen? Die Antworten gehen verloren.')) return;
      await api(`/api/sessions/${b.dataset.delSession}`, { method: 'DELETE' });
      home();
    });
  }

  // Stand, Prüfungstermin und was heute sinnvoll ist
  function todayHtml(prog, sessions) {
    const st = store.get('ap2.settings', {});
    const days = st.examDate ? Math.ceil((Date.parse(st.examDate + 'T00:00') - Date.now()) / 864e5) : null;
    const lastSim = sessions.filter((x) => x.mode === 'exam' && x.finished).map((x) => x.created_at).sort().pop();
    const simDays = lastSim ? Math.floor((Date.now() - Date.parse(lastSim)) / 864e5) : null;
    const lastBackup = localStorage.getItem('ap2.lastBackup');
    const weak = prog.topic_stats.find((t) => t.ratio < 0.67);
    const todo = [];
    const rv = prog.review;
    if (rv.due) todo.push(`<li><span>${rv.due} ${rv.due === 1 ? 'Teilaufgabe ist' : 'Teilaufgaben sind'} heute zur Wiederholung fällig${rv.mistakes ? `, davon ${rv.mistakes} aus dem Fehlerkorb` : ''}</span><button type="button" class="btn sm" data-review>Wiederholen</button></li>`);
    else if (rv.next) todo.push(`<li><span>Nichts fällig. Die nächste Wiederholung ist am ${new Date(rv.next).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} dran.</span><span></span></li>`);
    if (weak) todo.push(`<li><span>Schwächstes Thema: ${esc(weak.topic)}, bisher ${Math.round(weak.ratio * 100)} % der Punkte</span><button type="button" class="btn sm" data-train="${esc(weak.topic)}">Thema üben</button></li>`);
    if (simDays === null || simDays >= 7) todo.push(`<li><span>${simDays === null ? 'Noch keine Prüfungssimulation abgeschlossen' : `Letzte Prüfungssimulation vor ${simDays} Tagen`}</span><a class="btn sm" href="#/exams">Prüfung simulieren</a></li>`);
    const drillDue = window.AP2Tools.drillDue(store.get('ap2.drill', {}), Date.now());
    todo.push(drillDue.length ? `<li><span>Im Rechentrainer ${drillDue.length === 1 ? 'ist ein Aufgabentyp' : `sind ${drillDue.length} Aufgabentypen`} zur Wiederholung fällig: ${esc(drillDue.map((k) => window.AP2Tools.DRILLS[k].name).join(', '))}</span><a class="btn sm" href="#/rechnen" data-drill-due>Wiederholen</a></li>`
      : '<li><span>Fünf Rechenaufgaben zu Subnetting, Spannungsfall und USV</span><a class="btn sm" href="#/rechnen">Rechentrainer</a></li>');
    if (sessions.length && (!lastBackup || Date.now() - Date.parse(lastBackup) > 14 * 864e5)) todo.push(`<li><span>${lastBackup ? `Letzte Sicherung am ${fmtDate(lastBackup)}` : 'Dein Fortschritt ist noch nicht gesichert'}</span><a class="btn sm" href="#/stats/daten">Sichern</a></li>`);
    const ready = prog.readiness.filter((r) => r.points !== null);
    return `<section class="sheet today" aria-labelledby="today-h">
      <h2 id="today-h">Dein Stand</h2>
      <dl class="dl">
        <div><dt><label for="h-date">Prüfungstermin</label></dt><dd><input class="input date" type="date" id="h-date" value="${esc(st.examDate || '')}">${days !== null ? `<small>${days > 0 ? `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}` : days === 0 ? 'heute' : 'vorbei'}</small>` : ''}</dd></div>
        ${ready.length ? `<div><dt>Prognose der schriftlichen Bereiche</dt><dd>${ready.map((r) => `<span class="prog">${kindShort(r.kind)} <b>${r.points}</b></span>`).join('')}</dd></div>` : ''}
      </dl>
      <h3 class="today-sub">Heute sinnvoll</h3>
      <ul class="todo">${todo.slice(0, 3).join('')}</ul>
    </section>`;
  }
  function bindToday() {
    $('#h-date').onchange = (ev) => { const st = store.get('ap2.settings', {}); st.examDate = ev.target.value; store.set('ap2.settings', st); home(); };
    $$('[data-train]', app).forEach((b) => b.onclick = () => trainTopic(b.dataset.train));
    $$('[data-review]', app).forEach((b) => b.onclick = trainReview);
    $$('[data-drill-due]', app).forEach((b) => b.onclick = () => { const s = store.get('ap2.settings', {}); s.drill = 'due'; store.set('ap2.settings', s); });
  }
  async function trainReview() {
    try {
      const e = await post('/api/review/exam', {});
      state.exams = null;
      const v = await post('/api/sessions', { exam_id: e.id, mode: 'learn', parts: [] });
      location.hash = `#/learn/${v.session.id}`;
    } catch (err) { toast(err.message, true); }
  }

  // ---------- Prüfungsliste ----------
  async function examsView(filter) {
    setNav('exams');
    const exams = await loadExams(true);
    const f = filter || 'real';
    const groups = { real: 'Originalprüfungen', wiso: 'Nur WiSo', gen: 'Generiert', topic: 'Themen-Training' };
    const count = (k) => exams.filter((e) => examKind(e) === k).length;
    const rows = exams.filter((e) => examKind(e) === f);
    app.innerHTML = `${subnav(EXAM_TABS, 'exams')}<div class="page-head"><div><h1>Prüfungen</h1><p class="lede">Jede Prüfung lässt sich lernen, als Prüfung simulieren oder als Bogen mit Korrekturrand drucken.</p></div>
        <a class="btn" href="#/generate">Neue Prüfung generieren</a></div>
      <nav class="tabs" aria-label="Prüfungsarten">${Object.entries(groups).map(([k, label]) => `<a href="#/exams/${k}" ${k === f ? 'aria-current="page"' : ''}>${label}<span class="count">${count(k)}</span></a>`).join('')}</nav>
      ${rows.length ? `<table class="t stack"><thead><tr><th>Prüfung</th><th>Teile</th><th>Lösungen</th><th><span class="visually-hidden">Aktionen</span></th></tr></thead><tbody>
      ${rows.map((e) => `<tr>
        <td data-label="Prüfung"><a class="row-title" href="#/exam-detail/${e.id}">${esc(examName(e))}</a>${examKind(e) === 'real' || examKind(e) === 'wiso' ? '' : `<span class="sub">${esc(e.id)}</span>`}</td>
        <td data-label="Teile">${e.parts.map((p) => `${kindShort(p.kind)} <span class="muted">(${p.items})</span>`).join(', ')}</td>
        <td data-label="Lösungen">${e.official_solutions ? 'IHK-Lösungshinweise' : '<span class="tag warn">eigene Musterlösung</span>'}</td>
        <td class="acts"><div class="actions"><button type="button" class="btn sm" data-start="${e.id}" data-mode="learn">Lernen</button><button type="button" class="btn sm" data-start="${e.id}" data-mode="exam">Prüfung</button><a class="btn sm quiet" href="#/exam-detail/${e.id}">Details</a></div></td>
      </tr>`).join('')}
      </tbody></table>` : `<p class="empty">${f === 'gen' ? 'Noch keine generierte Prüfung. Der Generator erstellt eine nach IHK-Schema.' : f === 'topic' ? 'Noch kein Themen-Training. Starte eines in der Wissensbasis über „Zu diesem Thema üben“.' : 'Keine Prüfungen in dieser Ansicht.'}</p>`}`;
    $$('[data-start]', app).forEach((b) => b.onclick = () => startDialog(b.dataset.start, b.dataset.mode));
  }

  async function startDialog(examId, mode) {
    const exams = await loadExams();
    const e = exams.find((x) => x.id === examId);
    if (!e) return;
    openModal(`<h2 id="modal-title">${mode === 'exam' ? 'Prüfung simulieren' : 'Lernmodus starten'}</h2>
      <p><strong>${esc(examName(e))}</strong></p>
      <p class="small muted" style="margin-top:var(--space-xs)">${mode === 'exam'
        ? 'Die gewählten Teile laufen nacheinander mit Zeitlimit. Es gibt keine Tipps und keine Lösungen. Ausgewertet wird nach der Abgabe des letzten Teils.'
        : 'Ohne Zeitlimit. Zu jeder Teilaufgabe gibt es drei Tipps, den Stichwort-Check und die Musterlösung.'}</p>
      <fieldset style="margin-top:var(--space-md)"><legend>Teile</legend>${e.parts.map((p) => `<label class="check"><input type="checkbox" name="part" value="${p.id}" checked><span>${esc(kindLabel(p.kind))}<br><span class="small muted">${p.duration_min} Minuten, ${p.max_points} Punkte, ${p.tasks} Aufgaben</span></span></label>`).join('')}</fieldset>
      <div class="actions"><button type="button" class="btn primary" id="start-go" autofocus>Starten</button><button type="button" class="btn quiet" data-close>Abbrechen</button></div>`);
    $('#start-go').onclick = async () => {
      const parts = $$('#modal input[name=part]:checked').map((i) => i.value);
      if (!parts.length) { toast('Bitte mindestens einen Teil wählen', true); return; }
      $('#start-go').disabled = true;
      try {
        const v = await post('/api/sessions', { exam_id: examId, mode, parts });
        closeModal();
        location.hash = `#/${mode === 'exam' ? 'exam' : 'learn'}/${v.session.id}`;
      } catch (err) { $('#start-go').disabled = false; toast(err.message, true); }
    };
  }

  async function examDetail(id) {
    setNav('exams');
    const e = await api(`/api/exams/${id}`);
    const sessions = (await api('/api/sessions')).filter((s) => s.exam_id === id);
    const pdf = (parts, sol) => `/api/exams/${id}/pdf?parts=${parts}&solutions=${sol ? 1 : 0}`;
    const kind = examKind(e);
    app.innerHTML = `<div class="page-head"><div>
        <h1>${esc(examName(e))}</h1>
        <p class="meta"><span>${kind === 'real' || kind === 'wiso' ? 'IHK-Originalprüfung' : kind === 'topic' ? 'Themen-Training' : 'Generierte Prüfung'}</span><span>${e.official_solutions ? 'mit IHK-Lösungshinweisen' : 'mit eigenen Musterlösungen'}</span></p>
      </div>
      <div class="actions"><button type="button" class="btn primary" id="d-learn">Lernmodus</button><button type="button" class="btn" id="d-exam">Prüfung simulieren</button></div></div>
      ${examNote(e) ? `<p class="small muted prose">${esc(examNote(e))}</p>` : ''}
      <section class="section" aria-labelledby="teile-h">
        <h2 id="teile-h">Teile</h2>
        <table class="t stack"><thead><tr><th>Teil</th><th class="num">Zeit</th><th class="num">Punkte</th><th class="num">Teilaufgaben</th><th>Material</th></tr></thead><tbody>
        ${e.parts.map((p) => `<tr>
          <td data-label="Teil"><span class="row-title">${esc(kindLabel(p.kind))}</span><span class="sub">${esc(p.title)}</span></td>
          <td class="num" data-label="Zeit">${p.duration_min} min</td>
          <td class="num" data-label="Punkte">${p.max_points}</td>
          <td class="num" data-label="Teilaufgaben">${p.tasks.reduce((a, t) => a + t.items.length, 0)}</td>
          <td data-label="Material"><div class="actions">
            ${pdfLink(pdf(p.id, false), 'PDF Aufgaben')}${pdfLink(pdf(p.id, true), 'PDF Lösungen')}
            ${p.page_images && p.page_images.length ? `<button type="button" class="btn sm quiet" data-pages="${p.id}">Originalseiten</button>` : ''}
            ${p.solution_pages && p.solution_pages.length ? `<button type="button" class="btn sm quiet" data-solpages="${p.id}">Lösungs-Original</button>` : ''}
            ${(p.attachments || []).map((a, i) => a.pages && a.pages.length ? `<button type="button" class="btn sm quiet" data-att="${p.id}:${i}">${esc(a.title || 'Belegsatz')}</button>` : '').join('')}</div></td>
        </tr>`).join('')}
        </tbody></table>
        <p class="actions" style="margin-top:var(--space-md)">${pdfLink(pdf('', false), 'Kompletter Prüfungsbogen als PDF')}${pdfLink(pdf('', true), 'Alle Lösungshinweise als PDF')}</p>
      </section>
      <section class="section" aria-labelledby="aufg-h">
        <h2 id="aufg-h">Aufgaben</h2>
        ${e.parts.map((p) => `<details class="disc"><summary>${esc(kindLabel(p.kind))}<span class="tag">${p.tasks.length} Aufgaben</span></summary><div class="disc-body"><ol>${p.tasks.map((t) => `<li>${esc(t.title || 'Aufgabe ' + t.number)} <span class="muted num small">${t.points} P.</span></li>`).join('')}</ol></div></details>`).join('')}
      </section>
      ${sessions.length ? `<section class="section" aria-labelledby="sess-h"><h2 id="sess-h">Bisherige Sitzungen</h2><table class="t stack"><thead><tr><th>Datum</th><th>Modus</th><th>Stand</th><th><span class="visually-hidden">Aktion</span></th></tr></thead><tbody>${sessions.map((s) => `<tr><td data-label="Datum">${fmtDate(s.created_at)}</td><td data-label="Modus">${s.mode === 'exam' ? 'Prüfung' : 'Lernen'}</td><td data-label="Stand">${s.finished ? `<span class="num">${fmtPts(s.total_points)} / ${s.total_max}</span> ${s.passed ? '<span class="tag ok">bestanden</span>' : '<span class="tag bad">nicht bestanden</span>'}` : `${s.answered} Antworten`}</td><td class="acts"><a class="btn sm" href="${sessionHref(s)}">${s.finished ? 'Auswertung' : 'Fortsetzen'}</a></td></tr>`).join('')}</tbody></table></section>` : ''}
      ${e.sources && e.sources.some((s) => s.endsWith('.pdf')) ? `<section class="section"><details class="disc"><summary>Quellen (Original-PDFs)</summary><div class="disc-body"><ul class="small">${e.sources.filter((s) => s.endsWith('.pdf')).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div></details></section>` : ''}
      ${e.origin === 'generated' ? `<section class="section"><button type="button" class="btn danger sm" id="d-del">Diese Prüfung löschen</button></section>` : ''}`;
    $('#d-learn').onclick = () => startDialog(id, 'learn');
    $('#d-exam').onclick = () => startDialog(id, 'exam');
    const del = $('#d-del');
    if (del) del.onclick = async () => { if (confirm('Diese Prüfung löschen? Das lässt sich nicht rückgängig machen.')) { await api(`/api/exams/${id}`, { method: 'DELETE' }); location.hash = '#/exams/gen'; } };
    $$('[data-pages]', app).forEach((b) => b.onclick = () => pageViewer(e.parts.find((p) => p.id === b.dataset.pages).page_images, 0, 'Originalprüfung'));
    $$('[data-solpages]', app).forEach((b) => b.onclick = () => pageViewer(e.parts.find((p) => p.id === b.dataset.solpages).solution_pages, 0, 'Lösungshinweise (Original)'));
    $$('[data-att]', app).forEach((b) => { const [pid, i] = b.dataset.att.split(':'); const a = e.parts.find((p) => p.id === pid).attachments[+i]; b.onclick = () => pageViewer(a.pages, 0, a.title || 'Belegsatz'); });
  }

  // ---------- Generator ----------
  async function generateView() {
    setNav('exams');
    const bank = await api('/api/bank/summary');
    app.innerHTML = `${subnav(EXAM_TABS, 'generate')}<div class="page-head"><div><h1>Prüfung generieren</h1><p class="lede">Eine neue Prüfung nach IHK-Schema aus dem Fragenpool zusammenstellen.</p></div></div>
      <div class="split">
        <form class="sheet" id="g-form" novalidate>
          <fieldset><legend>Teile</legend>
            <label class="check"><input type="checkbox" name="gp" value="teil1" checked><span>Teil 1: Installation und Service<br><span class="small muted">4 Aufgaben zu je 25 Punkten, 90 Minuten</span></span></label>
            <label class="check"><input type="checkbox" name="gp" value="teil2" checked><span>Teil 2: Stromversorgung<br><span class="small muted">4 Aufgaben zu je 25 Punkten, 90 Minuten</span></span></label>
            <label class="check"><input type="checkbox" name="gp" value="wiso" checked><span>Teil 3: Wirtschafts- und Sozialkunde<br><span class="small muted">30 gebundene Aufgaben, 60 Minuten</span></span></label>
          </fieldset>
          <div style="display:grid;gap:var(--space-md);margin-top:var(--space-lg);grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))">
            <label class="field"><span>Titel (optional)</span><input class="input" type="text" id="g-title" name="title" autocomplete="off" placeholder="Übungsprüfung 1"></label>
            <label class="field"><span>Seed (optional, für Wiederholbarkeit)</span><input class="input num" type="text" id="g-seed" name="seed" inputmode="numeric" autocomplete="off" placeholder="12345"></label>
          </div>
          <label class="check" style="margin-top:var(--space-sm)"><input type="checkbox" id="g-avoid" checked><span>Aufgabenblöcke der letzten zwei Generierungen meiden</span></label>
          <div class="actions" style="margin-top:var(--space-lg)"><button type="submit" class="btn primary" id="g-go">Prüfung generieren</button><span id="g-status" class="small muted" role="status"></span></div>
        </form>
        <section aria-labelledby="pool-h">
          <h2 id="pool-h">Fragenpool</h2>
          ${bank.length ? `<table class="t" style="margin-top:var(--space-sm)"><thead><tr><th>Teil</th><th class="num">Umfang</th></tr></thead><tbody>${bank.map((b) => `<tr><td>${esc(kindLabel(b.kind))}<span class="sub">${b.clusters.map(([c, n]) => `${esc(c || 'ohne Thema')} (${n})`).join(', ')}</span></td><td class="num">${b.kind === 'WiSo' ? `${b.items} Fragen` : `${b.blocks} Blöcke`}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Noch kein Fragenpool geladen. Lege Dateien unter data/bank an.</p>'}
        </section>
      </div>`;
    $('#g-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const parts = $$('input[name=gp]:checked', app).map((i) => i.value);
      if (!parts.length) { toast('Bitte mindestens einen Teil wählen', true); return; }
      const seedRaw = $('#g-seed').value.trim();
      if (seedRaw && !/^\d+$/.test(seedRaw)) { $('#g-seed').setAttribute('aria-invalid', 'true'); toast('Der Seed muss eine ganze Zahl sein', true); $('#g-seed').focus(); return; }
      $('#g-seed').removeAttribute('aria-invalid');
      const body = { parts, title: $('#g-title').value.trim() || null, avoid_recent: $('#g-avoid').checked };
      if (seedRaw) body.seed = Number(seedRaw);
      $('#g-status').textContent = 'Wird zusammengestellt …';
      $('#g-go').disabled = true;
      try {
        const e = await post('/api/generate', body);
        state.exams = null;
        location.hash = `#/exam-detail/${e.id}`;
      } catch (err) { $('#g-status').textContent = ''; $('#g-go').disabled = false; toast(err.message, true); }
    };
  }

  // ---------- Wissen ----------
  // Schaubilder stammen aus web/diagrams.js (eigene SVGs, nur Klassen und Tokens), Links aus topics.json
  // Schlüssel „Teil1:Fehlersuche“ geht vor „Fehlersuche“, weil manche Themennamen in zwei Prüfungsteilen vorkommen
  const diagramsOf = (t) => { const D = window.AP2Diagrams || {}; return D[`${t.part}:${t.name}`] || D[t.name] || []; };
  const figuresHtml = (t) => diagramsOf(t).map((d) => `<figure class="dia-fig"><div class="dia-wrap">${d.svg}</div><figcaption><strong>${esc(d.title)}.</strong> ${esc(d.caption)}</figcaption></figure>`).join('');
  // Lernvideos: erst ein Knopf, das Video (youtube-nocookie.com) lädt erst nach Klick, vorher geht nichts an YouTube
  const videosHtml = (t) => (t.videos || []).filter((v) => /^[\w-]{11}$/.test(v.id)).map((v) => `<div class="video" data-yt="${v.id}"><button type="button" class="video-start" aria-label="Video abspielen: ${esc(v.title)}"><span class="video-play" aria-hidden="true">${icon('<path d="M8 5v14l11-7z"/>')}</span><span><strong>${esc(v.title)}</strong><span class="small muted">${esc(v.channel)}, YouTube</span></span></button></div>`).join('');
  const bindVideos = (root) => $$('[data-yt]', root).forEach((box) => { $('.video-start', box).onclick = () => {
    box.classList.add('playing');
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${box.dataset.yt}?autoplay=1&rel=0" title="${esc($('strong', box) ? $('strong', box).textContent : 'Lernvideo')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }; });
  const linksHtml = (t) => t.links && t.links.length ? `<h4>Mehr dazu</h4><ul class="links">${t.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a> <span class="small muted">${esc(new URL(l.url).hostname.replace(/^www\./, ''))}</span></li>`).join('')}</ul>` : '';
  // ---------- Wiki: Themen der Wissensbasis und vertiefende Artikel (fidup-wiki, ISC-Lizenz) ----------
  const slugify = (x) => x.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let wikiCache = null;
  async function wikiData() {
    if (wikiCache) return wikiCache;
    const [topics, counts, ana, articles] = await Promise.all([loadTopics(), api('/api/topic-counts'), api('/api/topic-analysis'), api('/api/wiki')]);
    const dup = new Set(topics.map((t) => t.name).filter((n, i, a) => a.indexOf(n) !== i));
    const strip = (h) => h.replace(/<[^>]+>/g, ' ');
    const themen = topics.map((t) => ({
      kind: 'thema', t, name: t.name, part: t.part, slug: dup.has(t.name) ? slugify(`${t.part} ${t.name}`) : slugify(t.name),
      ana: ana[t.name.toLowerCase()] || null, items: (counts.find((c) => c.topic.toLowerCase() === t.name.toLowerCase()) || {}).items || 0,
      text: [t.name, t.summary, ...(t.key_points || []), ...(t.pitfalls || []), ...(t.formulas || [])].join(' ').toLowerCase(),
    }));
    // Gleichnamige Themen (Fehlersuche): Vertiefungsartikel gehören zum IT-Teil
    const themaOf = (name) => themen.find((x) => x.name === name && (!dup.has(name) || x.part === 'Teil1'));
    const artikel = articles.map((a) => ({ kind: 'artikel', ...a, name: a.title, thema: themaOf(a.topic), text: `${a.title} ${a.description} ${strip(a.html)}`.toLowerCase() }));
    themen.forEach((x) => { x.artikel = artikel.filter((a) => a.thema === x); });
    wikiCache = { themen, artikel, all: [...themen, ...artikel] };
    return wikiCache;
  }
  const wikiHref = (e) => `#/wiki/${e.kind}/${e.slug}`;
  const labelOf = (x) => (x.ana || { label: 'Hintergrund' }).label;
  // Formeln aus LaTeX lesbar machen (ohne Formelbibliothek)
  function latexText(s) {
    // \left und \right zuerst, sonst macht die Ersetzung für \le daraus „≤ft“
    let t = s.replace(/\\(?:left|right)\s*/g, '').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\(?:mathrm|mathbf|operatorname)\{([^}]*)\}/g, '$1');
    // Hoch- und Tiefstellungen zuerst auflösen, damit innere Klammern Brüche nicht blockieren
    t = t.replace(/\\_/g, '_').replace(/\^\{([^{}]*)\}/g, '^$1').replace(/_\{([^{}]*)\}/g, '_$1');
    for (let k = 0; k < 3; k++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1) / ($2)').replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
    const R = { '\\times': '×', '\\cdot': '·', '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\approx': '≈', '\\Rightarrow': '⇒', '\\rightarrow': '→', '\\to': '→', '\\sum': 'Σ', '\\Delta': 'Δ', '\\varphi': 'φ', '\\phi': 'φ', '\\Omega': 'Ω', '\\pi': 'π', '\\%': '%', '\\,': ' ', '\\;': ' ', '\\space': ' ', '\\ ': ' ' };
    Object.entries(R).forEach(([a, b]) => { t = t.split(a).join(b); });
    return t.replace(/\^\{([^}]*)\}/g, '^$1').replace(/_\{([^}]*)\}/g, '_$1').replace(/[{}]/g, '').replace(/\\([a-zA-Z]+)/g, '$1').replace(/\s+/g, ' ').trim();
  }
  // Mermaid-Diagramme als Baumliste bzw. Nachrichtenfolge darstellen (keine Diagrammbibliothek nötig)
  function mermaidHtml(code) {
    const lines = code.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'));
    const head = lines.shift() || '';
    if (/^sequenceDiagram/.test(head)) {
      const msgs = lines.map((l) => l.match(/^(.+?)\s*-{1,2}>{1,2}[+-]?\s*(.+?)\s*:\s*(.+)$/)).filter(Boolean);
      return msgs.length ? `<ol class="seq">${msgs.map((m) => `<li><strong>${esc(m[1])}</strong> an <strong>${esc(m[2])}</strong>: ${esc(m[3])}</li>`).join('')}</ol>` : '';
    }
    if (!/^(graph|flowchart)/.test(head)) return '';
    const label = {}, kids = {}, child = new Set(), order = [];
    const node = (tok) => { const m = tok.trim().match(/^([\w-]+)\s*(?:[[({>]+\s*["/\\]?(.*?)["/\\]?\s*[\])}]+)?\s*$/); if (!m) return null; if (m[2]) label[m[1]] = m[2]; if (!order.includes(m[1])) order.push(m[1]); return m[1]; };
    for (const l of lines) {
      if (/^(subgraph|end|style|classDef|class|click|direction|linkStyle)\b/.test(l)) continue;
      const parts = l.split(/\s*(?:-{2,}>?|-\.+->?|={2,}>?)\s*(?:\|[^|]*\|\s*)?/).map(node);
      for (let k = 0; k + 1 < parts.length; k++) if (parts[k] && parts[k + 1]) { (kids[parts[k]] = kids[parts[k]] || []).push(parts[k + 1]); child.add(parts[k + 1]); }
    }
    const seen = new Set();
    const li = (n, d) => { const again = seen.has(n); seen.add(n); const sub = !again && d < 6 && kids[n] ? `<ul>${kids[n].map((c) => li(c, d + 1)).join('')}</ul>` : ''; return `<li>${esc(latexText(label[n] || n).replace(/<br\s*\/?>/gi, ' '))}${sub}</li>`; };
    const roots = order.filter((n) => !child.has(n));
    return roots.length ? `<ul class="mtree">${roots.map((r) => li(r, 0)).join('')}</ul>` : '';
  }
  function articleBody(html, known) {
    const box = document.createElement('div'); box.innerHTML = html;
    box.querySelectorAll('pre > code.language-mermaid').forEach((c) => { const h = mermaidHtml(c.textContent); const f = document.createElement('figure'); f.className = 'mermaid-tree'; f.innerHTML = h ? `<figcaption>Übersicht</figcaption>${h}` : ''; c.parentElement.replaceWith(f); if (!h) f.remove(); });
    box.querySelectorAll('.math').forEach((m) => { const sp = document.createElement('span'); sp.className = 'formula'; sp.textContent = latexText(m.textContent); m.replaceWith(sp); });
    box.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (/^https?:/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; return; }
      const slug = h.replace(/[#?].*$/, '').replace(/\/$/, '').split('/').pop();
      if (known.has(slug)) a.setAttribute('href', `#/wiki/artikel/${slug}`);
      else { a.href = `https://t128n.github.io/fidup-wiki/lerninhalte/${slug}/`; a.target = '_blank'; a.rel = 'noopener'; }
    });
    box.querySelectorAll('h2').forEach((h, k) => { h.id = `abschnitt-${k + 1}`; });
    return box.innerHTML;
  }
  const crumbs = (list) => `<nav class="crumbs" aria-label="Brotkrumen"><ol>${list.map(([t, h]) => `<li>${h ? `<a href="${h}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}</li>`).join('')}</ol></nav>`;
  function wikiCard(x) {
    return x.kind === 'thema'
      ? `<a class="wiki-card" href="${wikiHref(x)}"><span class="wc-title">${esc(x.name)}</span><span class="tag${labelOf(x) === 'Prüfungskern' ? ' accent' : ''}">${labelOf(x)}${x.ana ? `, ${x.ana.termine} von ${x.ana.of} Terminen` : ''}</span><span class="small muted wc-sum">${esc((x.t.summary || '').split(/(?<=\.)\s/)[0])}</span><span class="small wc-meta">${[diagramsOf(x.t).length ? `${diagramsOf(x.t).length} ${diagramsOf(x.t).length === 1 ? 'Schaubild' : 'Schaubilder'}` : '', x.artikel.length ? `${x.artikel.length} ${x.artikel.length === 1 ? 'Vertiefung' : 'Vertiefungen'}` : ''].filter(Boolean).join(', ')}</span></a>`
      : `<a class="wiki-card art" href="${wikiHref(x)}"><span class="wc-title">${esc(x.title)}</span><span class="tag">Vertiefung${x.thema ? `, ${esc(x.thema.name)}` : ''}</span><span class="small muted wc-sum">${esc(x.description.split(/(?<=\.)\s/)[0])}</span></a>`;
  }
  async function wikiIndex() {
    setNav('topics');
    const W = await wikiData();
    const st = store.get('ap2.settings', {}); const mode = ['part', 'rel', 'az'].includes(st.wikiMode) ? st.wikiMode : 'part';
    const parts = ['Teil1', 'Teil2', 'WiSo'];
    const body = () => {
      if (mode === 'az') {
        const all = [...W.all].sort((a, b) => a.name.localeCompare(b.name, 'de'));
        const letters = [...new Set(all.map((x) => x.name[0].toUpperCase()))];
        return `<nav class="az" aria-label="Buchstaben">${letters.map((l) => `<a href="#az-${encodeURIComponent(l)}" data-az="${esc(l)}">${esc(l)}</a>`).join('')}</nav>${letters.map((l) => `<section class="section" id="az-${esc(l)}"><h2>${esc(l)}</h2><ul class="az-list">${all.filter((x) => x.name[0].toUpperCase() === l).map((x) => `<li><a href="${wikiHref(x)}">${esc(x.name)}</a> <span class="small muted">${x.kind === 'thema' ? kindShort(x.part) : 'Vertiefung'}</span></li>`).join('')}</ul></section>`).join('')}`;
      }
      const groups = mode === 'rel'
        ? [['Prüfungskern: in mindestens 70 % der Prüfungstermine', 'Prüfungskern'], ['Kam vor: seltener gefragt', 'Kam vor'], ['Hintergrund: bisher nicht direkt gefragt', 'Hintergrund']].map(([h, l]) => [h, W.themen.filter((x) => labelOf(x) === l).sort((a, b) => (b.ana ? b.ana.termine / b.ana.of : 0) - (a.ana ? a.ana.termine / a.ana.of : 0))])
        : parts.map((p) => [kindLabel(p), W.themen.filter((x) => x.part === p)]);
      return groups.map(([h, list]) => `<section class="section"><h2>${esc(h)}</h2><div class="wiki-grid">${list.map(wikiCard).join('')}</div></section>`).join('');
    };
    app.innerHTML = `${subnav(WIKI_TABS, 'wiki')}<div class="page-head"><div><h1>Wiki</h1><p class="lede">Das Nachschlagewerk zur Prüfung: ${W.themen.length} Themen mit Schaubildern, Formeln und Fundstellen aus echten Prüfungen, dazu ${W.artikel.length} vertiefende Artikel.</p></div>
</div>
      <div class="tools-row wiki-tools"><label class="field wiki-search"><span>Im Wiki suchen</span><input class="input" type="search" id="w-q" autocomplete="off" placeholder="DHCP, Schleifenimpedanz, Kündigungsfrist"></label>
        <div class="seg" role="group" aria-label="Ansicht">${[['part', 'Nach Bereich'], ['rel', 'Nach Relevanz'], ['az', 'A bis Z']].map(([k, l]) => `<button type="button" class="btn sm${k === mode ? ' primary' : ''}" data-wmode="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div></div>
      <div id="w-results" aria-live="polite"></div>
      <div id="w-browse">${body()}</div>`;
    $$('[data-wmode]', app).forEach((b) => b.onclick = () => { const s2 = store.get('ap2.settings', {}); s2.wikiMode = b.dataset.wmode; store.set('ap2.settings', s2); wikiIndex(); });
    $$('[data-az]', app).forEach((a) => a.onclick = (ev) => { ev.preventDefault(); const el = document.getElementById(`az-${a.dataset.az}`); if (el) el.scrollIntoView({ behavior: 'smooth' }); });
    const q = $('#w-q');
    q.oninput = () => {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      $('#w-browse').hidden = !!words.length;
      if (!words.length) { $('#w-results').innerHTML = ''; return; }
      const hits = W.all.filter((x) => words.every((w) => x.text.includes(w)))
        .map((x) => ({ x, score: (words.every((w) => x.name.toLowerCase().includes(w)) ? 10 : 0) + (x.kind === 'thema' ? 2 : 0) }))
        .sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name, 'de')).slice(0, 40);
      $('#w-results').innerHTML = hits.length ? `<p class="small muted">${hits.length === 40 ? 'Die ersten 40' : hits.length} Treffer</p><div class="wiki-grid">${hits.map((h) => wikiCard(h.x)).join('')}</div>` : '<p class="empty">Nichts gefunden. Versuche einen anderen Begriff.</p>';
    };
  }
  async function wikiThema(slug) {
    setNav('topics');
    const W = await wikiData();
    // Adresse mit oder ohne Prüfungsteil („teil1-fehlersuche“ oder „netzwerk“)
    const x = W.themen.find((e) => e.slug === slug) || W.themen.find((e) => slugify(`${e.part} ${e.name}`) === slug);
    if (!x) { app.innerHTML = errorState('Thema nicht gefunden', 'Dieses Thema gibt es im Wiki nicht.'); return; }
    const t = x.t, a = x.ana;
    const sec = [['zusammenfassung', 'Zusammenfassung'], t.key_points && t.key_points.length && ['punkte', 'Das bringt Punkte'], diagramsOf(t).length && ['schaubilder', 'Schaubilder'], t.formulas && t.formulas.length && ['formeln', 'Formeln'], t.pitfalls && t.pitfalls.length && ['fehler', 'Typische Fehler'], a && ['pruefungen', 'In Prüfungen'], x.artikel.length && ['vertiefung', 'Vertiefung'], t.videos && t.videos.length && ['videos', 'Lernvideos'], t.links && t.links.length && ['mehr', 'Mehr dazu']].filter(Boolean);
    app.innerHTML = `${crumbs([['Wiki', '#/topics'], [kindLabel(x.part), '#/topics'], [x.name]])}
      <div class="page-head"><div><h1>${esc(x.name)}</h1><p class="small"><span class="tag${labelOf(x) === 'Prüfungskern' ? ' accent' : ''}">${labelOf(x)}${a ? `, ${a.termine} von ${a.of} Prüfungsterminen${a.trend ? `, ${a.trend}` : ''}` : ''}</span></p></div>
        ${x.items ? `<p class="actions"><button type="button" class="btn primary" data-train="${esc(x.name)}">Zu diesem Thema üben</button></p>` : ''}</div>
      <div class="wiki-layout">
        <nav class="wiki-toc" aria-label="Inhalt"><p class="small muted">Inhalt</p><ol>${sec.map(([id, l]) => `<li><a href="#w-${id}" data-toc="w-${id}">${l}</a></li>`).join('')}</ol></nav>
        <article class="wiki-body prose">
          <section id="w-zusammenfassung"><h2>Zusammenfassung</h2><p>${esc(t.summary)}</p>${t.example_question ? `<p class="note small"><strong>Typische Aufgabe:</strong> ${esc(t.example_question)}</p>` : ''}</section>
          ${t.key_points && t.key_points.length ? `<section id="w-punkte"><h2>Das bringt Punkte</h2><ul>${t.key_points.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></section>` : ''}
          ${diagramsOf(t).length ? `<section id="w-schaubilder"><h2>Schaubilder</h2>${figuresHtml(t)}</section>` : ''}
          ${t.formulas && t.formulas.length ? `<section id="w-formeln"><h2>Formeln</h2><div>${t.formulas.map((f) => `<span class="formula">${esc(f)}</span>`).join('')}</div></section>` : ''}
          ${t.pitfalls && t.pitfalls.length ? `<section id="w-fehler"><h2>Typische Fehler</h2><ul>${t.pitfalls.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></section>` : ''}
          ${a ? `<section id="w-pruefungen"><h2>In Prüfungen</h2><p>Kam in ${a.termine} von ${a.of} Prüfungsterminen vor, im Schnitt mit ${a.avg_points} Punkten je Termin.</p><ul class="small">${a.found.map((f) => `<li>${esc(f.termin)}: ${esc(f.refs.join(', '))}</li>`).join('')}</ul></section>` : ''}
          ${x.artikel.length ? `<section id="w-vertiefung"><h2>Vertiefung</h2><div class="wiki-grid">${x.artikel.map(wikiCard).join('')}</div></section>` : ''}
          ${t.videos && t.videos.length ? `<section id="w-videos"><h2>Lernvideos</h2><p class="small muted">Erklärvideos auf YouTube, ausgewählt passend zur Prüfung. Das Video läuft hier im Wiki; erst beim Abspielen werden Daten an YouTube (Google) übertragen.</p>${videosHtml(t)}</section>` : ''}
          ${t.links && t.links.length ? `<section id="w-mehr">${linksHtml(t).replace('<h4>Mehr dazu</h4>', '<h2>Mehr dazu</h2>')}</section>` : ''}
        </article>
      </div>`;
    $$('[data-train]', app).forEach((b) => b.onclick = () => trainTopic(b.dataset.train));
    $$('[data-toc]', app).forEach((l) => l.onclick = (ev) => { ev.preventDefault(); const el = document.getElementById(l.dataset.toc); if (el) el.scrollIntoView({ behavior: 'smooth' }); });
    bindVideos(app);
  }
  async function wikiArtikel(slug) {
    setNav('topics');
    const W = await wikiData();
    const x = W.artikel.find((e) => e.slug === slug);
    if (!x) { app.innerHTML = errorState('Artikel nicht gefunden', 'Diesen Artikel gibt es im Wiki nicht.'); return; }
    const known = new Set(W.artikel.map((e) => e.slug));
    const body = articleBody(x.html, known);
    const box = document.createElement('div'); box.innerHTML = body;
    const heads = [...box.querySelectorAll('h2')].map((h) => [h.id, h.textContent]);
    const siblings = x.thema ? x.thema.artikel.filter((e) => e !== x) : [];
    app.innerHTML = `${crumbs([['Wiki', '#/topics'], ...(x.thema ? [[kindLabel(x.thema.part), '#/topics'], [x.thema.name, wikiHref(x.thema)]] : []), [x.title]])}
      <div class="page-head"><div><h1>${esc(x.title)}</h1><p class="lede">${esc(x.description)}</p></div></div>
      <div class="wiki-layout">
        ${heads.length > 1 ? `<nav class="wiki-toc" aria-label="Inhalt"><p class="small muted">Inhalt</p><ol>${heads.map(([id, l]) => `<li><a href="#${id}" data-toc="${id}">${esc(l)}</a></li>`).join('')}</ol></nav>` : '<div></div>'}
        <article class="wiki-body prose">${body}
          ${x.sources.length ? `<section><h2>Quellen</h2><ul class="links">${x.sources.map((s2) => `<li><a href="${esc(s2.url)}" target="_blank" rel="noopener">${esc(s2.title)}</a></li>`).join('')}</ul></section>` : ''}
          ${x.thema ? `<section><h2>Zum Thema</h2><div class="wiki-grid">${wikiCard(x.thema)}${siblings.slice(0, 5).map(wikiCard).join('')}</div></section>` : ''}
          <p class="small muted wiki-license">Artikel aus <a href="https://t128n.github.io/fidup-wiki/lerninhalte/${esc(x.slug)}/" target="_blank" rel="noopener">fidup-wiki</a> (Lernzettel für Fachinformatiker Daten- und Prozessanalyse), © 2026 Torben Haack, ISC-Lizenz. Unverändert übernommen; Formeln und Diagramme vereinfacht dargestellt.</p>
        </article>
      </div>`;
    $$('[data-toc]', app).forEach((l) => l.onclick = (ev) => { ev.preventDefault(); const el = document.getElementById(l.dataset.toc); if (el) el.scrollIntoView({ behavior: 'smooth' }); });
  }
  async function formulasView() {
    setNav('topics');
    const topics = (await loadTopics()).filter((t) => t.formulas && t.formulas.length);
    const parts = ['Teil1', 'Teil2', 'WiSo'];
    app.innerHTML = `${subnav(WIKI_TABS, 'formeln')}<div class="page-head"><div><h1>Formelsammlung</h1><p class="lede">Alle Formeln aus der Wissensbasis, nach Prüfungsbereich und Thema. Zum Ausdrucken als Spickzettel fürs Lernen; in der Prüfung gilt der Belegsatz.</p></div>
        <p class="actions"><button type="button" class="btn" id="f-print">Drucken</button></p></div>
      ${parts.map((p) => { const list = topics.filter((t) => t.part === p); return list.length ? `<section class="section formulas"><h2>${esc(kindLabel(p))}</h2>${list.map((t) => `<div class="f-topic"><h3>${esc(t.name)}</h3><ul>${t.formulas.map((f) => `<li class="formula">${esc(f)}</li>`).join('')}</ul></div>`).join('')}</section>` : ''; }).join('')}`;
    $('#f-print').onclick = () => window.print();
  }
  async function trainTopic(topic) {
    try {
      const e = await post('/api/topic-exam', { topic, limit: 40 });
      state.exams = null;
      const v = await post('/api/sessions', { exam_id: e.id, mode: 'learn', parts: [] });
      location.hash = `#/learn/${v.session.id}`;
    } catch (err) { toast(err.message, true); }
  }
  // ---------- Statistik ----------
  const meterRow = (label, ratio, right, extra) => `<div class="meter-row"><span>${label}</span><div class="meter ${ratio >= 0.67 ? 'good' : ratio < 0.5 ? 'bad' : ''}" role="img" aria-label="${Math.round(ratio * 100)} Prozent"><span style="width:${Math.round(ratio * 100)}%"></span></div><span class="num small">${right}</span>${extra || '<span></span>'}</div>`;
  async function statsView(tab) {
    tab = tab || 'ueberblick';
    setNav('stats');
    const p = await api('/api/progress');
    const orig = Object.values(window.AP2Local.originals.all()).sort((a, b) => (b.finished || b.created).localeCompare(a.finished || a.created));
    const sections = {
      ueberblick: () => `<dl class="dl">
        <div><dt>Simulationen</dt><dd>${p.exams_finished}<small>${p.passed} bestanden</small></dd></div>
        <div><dt>Durchschnitt</dt><dd>${fmtPts(Math.round(p.average_points))}<small>Punkte, beste ${fmtPts(Math.round(p.best_points))}</small></dd></div>
        <div><dt>Lernsitzungen</dt><dd>${p.learn_sessions}</dd></div>
      </dl>
      <section class="section"><h2>Prüfungsbereitschaft</h2>
        <details class="why"><summary>Wie wird das berechnet?</summary><p class="prose small muted">Prognose je schriftlichem Bereich: 60 % aus deinen letzten drei Prüfungssimulationen, 40 % aus den letzten 40 bewerteten Teilaufgaben. Fehlt eine Quelle, zählt die andere allein.</p></details>
        ${p.readiness.map((r) => r.points === null ? `<div class="meter-row none"><span>${esc(kindLabel(r.kind))}</span><span class="small muted">Noch zu wenig Daten</span><span></span><span></span></div>` : meterRow(esc(kindLabel(r.kind)), r.points / 100, `${r.points} Punkte, Note ${window.AP2Tools.decimalGrade(r.points)}`, `<span class="small muted">${r.simulations} Sim., ${r.items} Aufg.</span>`)).join('')}
        <p class="actions" style="margin-top:var(--space-md)"><a class="btn sm" href="#/noten">Im Notenrechner verwenden</a></p>
      </section>
      <section class="section"><h2>Wiederholung</h2>
        ${p.review.total ? `<details class="why"><summary>Wie funktioniert das?</summary><p class="prose small muted">Jede bearbeitete Teilaufgabe aus echten Prüfungen und Themen-Trainings kommt nach festen Abständen wieder: sofort (Fehlerkorb), nach 1, 3, 7 und 14 Tagen. Mit mindestens 80 % der Punkte steigt sie eine Stufe auf, unter 50 % fällt sie zurück in den Fehlerkorb. Nach der letzten Stufe gilt sie als gemeistert.</p></details>
        <dl class="dl" style="margin-top:var(--space-sm)">${['Fehlerkorb', 'Stufe 1, nach 1 Tag', 'Stufe 2, nach 3 Tagen', 'Stufe 3, nach 7 Tagen', 'Stufe 4, nach 14 Tagen', 'Gemeistert'].map((l, i) => `<div><dt>${l}</dt><dd>${p.review.boxes[i]}</dd></div>`).join('')}</dl>
        <p class="actions" style="margin-top:var(--space-md)">${p.review.due ? `<button type="button" class="btn" data-review>${p.review.due} fällige wiederholen</button>` : `<span class="small muted">Heute ist nichts fällig${p.review.next ? `, die nächste Wiederholung kommt am ${fmtDate(p.review.next)}` : ''}.</span>`}</p>`
        : '<p class="empty">Noch nichts zu wiederholen. Hier landen alle bewerteten Teilaufgaben aus echten Prüfungen und Themen-Trainings.</p>'}
      </section>
      <section class="section"><h2>Themen, in denen Punkte fehlen</h2>
      ${p.topic_stats.length ? p.topic_stats.slice(0, 12).map((t) => meterRow(esc(t.topic), t.ratio, `${fmtPts(Math.round(t.points * 10) / 10)} / ${fmtPts(t.max_points)}`, `<button type="button" class="btn sm" data-train="${esc(t.topic)}">Üben</button>`)).join('') : '<p class="empty">Noch keine bewerteten Antworten. Nutze im Lernmodus den Stichwort-Check und die Selbstbewertung oder schließe eine Prüfungssimulation ab.</p>'}
      </section>`,
      verlauf: () => `${p.per_part.length ? `<section class="section"><h2>Ergebnisse je Prüfungsbereich</h2><table class="t stack"><thead><tr><th>Bereich</th><th class="num">Versuche</th><th class="num">Durchschnitt</th><th class="num">Bestes</th></tr></thead><tbody>${p.per_part.map((x) => `<tr><td data-label="Bereich">${esc(kindLabel(x.kind))}</td><td class="num" data-label="Versuche">${x.attempts}</td><td class="num" data-label="Durchschnitt">${x.average_percent.toFixed(0)} % (Note ${gradeFor(x.average_percent)})</td><td class="num" data-label="Bestes">${x.best_percent.toFixed(0)} %</td></tr>`).join('')}</tbody></table></section>` : ''}
      <section class="section"><h2>Letzte Sitzungen</h2>
      ${p.recent.length ? `<table class="t stack"><thead><tr><th>Datum</th><th>Prüfung</th><th>Modus</th><th class="num">Stand</th><th><span class="visually-hidden">Aktionen</span></th></tr></thead><tbody>${p.recent.map((s2) => `<tr><td data-label="Datum">${fmtDate(s2.created_at)}</td><td data-label="Prüfung">${esc(s2.exam_title)}</td><td data-label="Modus">${s2.mode === 'exam' ? 'Prüfung' : 'Lernen'}</td><td class="num" data-label="Stand">${s2.finished ? `${fmtPts(s2.total_points)} / ${s2.total_max}` : `${s2.answered} Antw.`}</td><td class="acts"><div class="actions"><a class="btn sm" href="${sessionHref(s2)}">${s2.finished ? 'Auswertung' : 'Öffnen'}</a><button type="button" class="btn sm quiet" data-del="${s2.id}">Löschen</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Noch keine Sitzungen.</p>'}
      </section>
      <section class="section"><h2>Archiv-Übungen</h2>
      ${orig.length ? `<table class="t stack"><thead><tr><th>Dokument</th><th>Beruf</th><th class="num">Ergebnis</th><th><span class="visually-hidden">Aktionen</span></th></tr></thead><tbody>${orig.map((o) => `<tr><td data-label="Dokument">${esc(o.title)}</td><td data-label="Beruf">${esc(o.beruf || '')}</td><td class="num" data-label="Ergebnis">${o.points != null ? `${fmtPts(o.points)} / ${fmtPts(o.max)}` : 'offen'}</td><td class="acts"><div class="actions"><a class="btn sm" href="#/original/${o.id}">Öffnen</a><button type="button" class="btn sm quiet" data-odel="${o.id}">Löschen</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Noch keine Originalprüfung aus dem Archiv bearbeitet.</p>'}
      </section>
      ${drillStatsHtml()}`,
      daten: () => `<section class="section" id="daten"><h2>Sicherung</h2>
        <p class="prose small muted">Fortschritt, Antworten, Notenrechner, Rechentrainer und Projekt liegen nur in diesem Browser auf diesem Gerät. Mit einer Sicherung nimmst du sie auf ein anderes Gerät mit oder holst sie nach dem Löschen der Browserdaten zurück.</p>
        <dl class="dl" style="margin-top:var(--space-sm)">
          <div><dt>Letzte Sicherung</dt><dd class="text">${localStorage.getItem('ap2.lastBackup') ? fmtDate(localStorage.getItem('ap2.lastBackup')) : 'noch nie'}</dd></div>
          ${fileApi ? `<div><dt>Speicherdatei</dt><dd class="text">${backupFile.handle ? `${esc(backupFile.handle.name)}<small>${backupFile.state === 'needs-permission' ? 'Zugriff erneuern, dann speichert sie wieder automatisch' : backupFile.state === 'error' ? 'Schreiben fehlgeschlagen' : 'speichert jede Änderung automatisch'}</small>` : 'keine'}</dd></div>` : ''}
        </dl>
        <div class="actions" style="margin-top:var(--space-md)"><button type="button" class="btn" id="d-export">Sicherung herunterladen</button><label class="btn" for="d-import">Sicherung einspielen</label><input type="file" id="d-import" accept="application/json" class="visually-hidden">
        ${fileApi ? `<button type="button" class="btn" id="d-file">${!backupFile.handle ? 'Speicherdatei wählen' : backupFile.state === 'needs-permission' ? 'Zugriff erneuern' : 'Andere Speicherdatei'}</button>${backupFile.handle ? '<button type="button" class="btn quiet" id="d-unlink">Speicherdatei trennen</button>' : ''}` : ''}</div>
        <p class="small muted" style="margin-top:var(--space-sm)">${fileApi ? 'Mit einer Speicherdatei schreibt der Browser jede Änderung nach zwei Sekunden in diese Datei, etwa in deinem Cloud-Ordner. Nach einem Neustart des Browsers einmal „Zugriff erneuern“ klicken.' : 'Automatisches Speichern in eine Datei geht in Chrome und Edge. In diesem Browser lädst du die Sicherung von Hand herunter.'}</p>
      </section>
      ${window.AP2Local.encrypted ? '<section class="section"><h2>Zugang</h2><p class="prose small muted">Das Passwort ist auf diesem Gerät gespeichert. Vergessen heißt: Beim nächsten Öffnen wird es wieder abgefragt. Dein Fortschritt bleibt erhalten.</p><p class="actions" style="margin-top:var(--space-sm)"><button type="button" class="btn quiet" id="d-lock">Passwort auf diesem Gerät vergessen</button></p></section>' : ''}
      ${window.AP2Local.builtAt ? `<p class="small muted" style="margin-top:var(--space-lg)">Datenstand: ${esc(window.AP2Local.builtAt)}</p>` : ''}`,
    };
    const titles = { ueberblick: ['Statistik', 'Was du schon kannst und wo noch Punkte fehlen.'], verlauf: ['Verlauf', 'Deine Sitzungen, Archiv-Übungen und der Rechentrainer.'], daten: ['Deine Daten', 'Sichern, auf ein anderes Gerät mitnehmen, Zugang verwalten.'] };
    app.innerHTML = `${subnav(STATS_TABS, tab)}<div class="page-head"><div><h1>${titles[tab][0]}</h1><p class="lede">${titles[tab][1]}</p></div></div>${sections[tab]()}`;
    $$('[data-del]', app).forEach((b) => b.onclick = async () => { if (confirm('Sitzung löschen? Die Antworten gehen verloren.')) { await api(`/api/sessions/${b.dataset.del}`, { method: 'DELETE' }); statsView(tab); } });
    $$('[data-odel]', app).forEach((b) => b.onclick = () => { if (confirm('Diese Archiv-Übung löschen?')) { window.AP2Local.originals.del(b.dataset.odel); statsView(tab); } });
    $$('[data-train]', app).forEach((b) => b.onclick = () => trainTopic(b.dataset.train));
    $$('[data-review]', app).forEach((b) => b.onclick = trainReview);
    const exp = $('#d-export'); if (exp) exp.onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([backupJson()], { type: 'application/json' }));
      a.download = `ap2-fortschritt-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      markBackup(); statsView(tab);
    };
    const imp = $('#d-import'); if (imp) imp.onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'ap2-simulator' || !j.data || typeof j.data !== 'object') throw new Error('Das ist keine Sicherung des AP2-Simulators');
        const n = (k) => Object.keys(j.data[k] || {}).length;
        const what = `${n('ap2.sessions')} Sitzungen, ${n('ap2.generated')} eigene Prüfungen, ${n('ap2.originals')} Archiv-Übungen${j.data['ap2.grades'] ? ', Notenrechner' : ''}${j.data['ap2.drill'] ? ', Rechentrainer' : ''}${j.data['ap2.project'] ? ', Projekt' : ''}`;
        if (!confirm(`Sicherung vom ${j.saved ? fmtDate(j.saved) : 'unbekannten Datum'} einspielen?\n\nEnthalten: ${what}.\n\nEinträge mit gleicher Kennung werden überschrieben, alle anderen bleiben.`)) return;
        Object.entries(j.data).forEach(([k, v]) => { if (!BACKUP_KEYS.includes(k) || !v || typeof v !== 'object') return; store.set(k, Object.assign(store.get(k, {}), v)); });
        toast('Sicherung eingespielt'); statsView(tab);
      } catch (e) { toast(e.message, true); } finally { ev.target.value = ''; }
    };
    const fileBtn = $('#d-file'); if (fileBtn) fileBtn.onclick = async () => {
      try {
        if (backupFile.handle && backupFile.state === 'needs-permission') { await writeBackupFile(true); statsView(tab); return; }
        const h = await window.showSaveFilePicker({ suggestedName: 'ap2-fortschritt.json', types: [{ description: 'AP2-Sicherung', accept: { 'application/json': ['.json'] } }] });
        backupFile.handle = h; await idb('readwrite', (st) => st.put(h, 'file')); await writeBackupFile(true);
        toast('Speicherdatei verbunden'); statsView(tab);
      } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); }
    };
    const unlinkBtn = $('#d-unlink'); if (unlinkBtn) unlinkBtn.onclick = async () => { backupFile.handle = null; backupFile.state = ''; await idb('readwrite', (st) => st.delete('file')).catch(() => {}); statsView(tab); };
    const lockBtn = $('#d-lock'); if (lockBtn) lockBtn.onclick = () => { if (confirm('Passwort auf diesem Gerät vergessen? Dein Fortschritt bleibt erhalten.')) window.AP2Local.lock(); };
  }

  // ---------- Datensicherung ----------
  const BACKUP_KEYS = ['ap2.sessions', 'ap2.generated', 'ap2.originals', 'ap2.grades', 'ap2.settings', 'ap2.drill', 'ap2.project'];
  const backupJson = () => JSON.stringify({ app: 'ap2-simulator', version: 2, saved: new Date().toISOString(), data: Object.fromEntries(BACKUP_KEYS.map((k) => [k, store.get(k, {})])) });
  const markBackup = () => { try { localStorage.setItem('ap2.lastBackup', new Date().toISOString()); } catch (e) { /* Speicher voll: Hinweis bleibt aus */ } };
  // Speicherdatei: Chrome und Edge schreiben nach jeder Änderung in eine gewählte Datei (File System Access API)
  const fileApi = 'showSaveFilePicker' in window;
  const idb = (mode, fn) => new Promise((res, rej) => {
    const o = indexedDB.open('ap2', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('kv');
    o.onerror = () => rej(o.error);
    o.onsuccess = () => { const tx = o.result.transaction('kv', mode); const r = fn(tx.objectStore('kv')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); };
  });
  const backupFile = { handle: null, state: '', timer: null };
  async function writeBackupFile(ask) {
    const h = backupFile.handle; if (!h) return;
    try {
      let perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && ask) perm = await h.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { backupFile.state = 'needs-permission'; return; }
      const w = await h.createWritable(); await w.write(backupJson()); await w.close();
      backupFile.state = 'ok'; markBackup();
    } catch (e) { backupFile.state = 'error'; console.warn('Speicherdatei:', e); }
  }
  window.addEventListener('ap2:changed', () => { clearTimeout(backupFile.timer); backupFile.timer = setTimeout(() => writeBackupFile(false), 2000); });
  if (fileApi) idb('readonly', (st) => st.get('file')).then((h) => { backupFile.handle = h || null; if (h) writeBackupFile(false); }).catch(() => { /* kein IndexedDB: ohne Speicherdatei weiter */ });

  // ---------- Notenrechner ----------
  async function gradesView() {
    setNav('stats');
    const T = window.AP2Tools;
    const vals = store.get('ap2.grades', {});
    app.innerHTML = `${subnav(STATS_TABS, 'noten')}<div class="page-head"><div><h1>Notenrechner</h1><p class="lede">Trag ein, was du schon weißt, jeweils 0 bis 100 Punkte. Offene Bereiche bleiben leer. Dann siehst du, was dir dort zum Bestehen noch fehlt.</p></div></div>
      <div class="split">
        <section class="sheet" aria-labelledby="g-in-h"><h2 id="g-in-h">Deine Punkte</h2>
          <div class="grade-list">${T.AREAS.map((a) => `<div class="grade-row"><label class="field" for="g-${a.id}"><span>${esc(a.label)} <span class="tag">${a.w} %</span></span></label><input class="input num" id="g-${a.id}" data-area="${a.id}" type="text" inputmode="decimal" autocomplete="off" placeholder="offen" value="${vals[a.id] ?? ''}" aria-describedby="g-${a.id}-n"><p class="small muted" id="g-${a.id}-n">${esc(a.note)}</p></div>`).join('')}</div>
          <div class="actions" style="margin-top:var(--space-md)"><button type="button" class="btn" id="g-prog">Prognose übernehmen</button><button type="button" class="btn quiet" id="g-reset">Alles leeren</button></div>
          <p class="small muted" style="margin-top:var(--space-xs)">„Prognose übernehmen“ setzt die drei schriftlichen Bereiche aus deiner Statistik ein.</p>
        </section>
        <section aria-labelledby="g-out-h"><h2 id="g-out-h" class="visually-hidden">Ergebnis</h2><div id="g-out" aria-live="polite"></div></section>
      </div>
      <section class="section"><h2>So wird gerechnet</h2><div class="prose small">
        <p>Grundlage ist die Ausbildungsverordnung IT-System-Elektroniker von 2020, Paragraph 15. Teil 1 zählt 20 %, das Projekt 50 %, die drei schriftlichen Bereiche von Teil 2 je 10 %. Innerhalb des Projekts rechnet der Rechner mit 30 % für die Dokumentation und 20 % für Präsentation und Fachgespräch. Die Verordnung selbst (Paragraph 11 Absatz 4) gewichtet beide Teile gleich, also je 25 %.</p>
        <p>Bestanden ist, wer im Gesamtergebnis und in der Stromversorgung mindestens 50 Punkte hat, in mindestens zwei weiteren Bereichen von Teil 2 ebenfalls 50 Punkte erreicht und in keinem Bereich von Teil 2 unter 30 Punkten liegt. Teil 1 zählt nur über das Gesamtergebnis.</p>
        <p>Fehlt nur wenig, kann eine mündliche Ergänzungsprüfung in einem schriftlichen Bereich von Teil 2 helfen. Altes und mündliches Ergebnis zählen dann 2 zu 1. Die Dezimalnote folgt der Tabelle der IHK Oldenburg. Einzelne IHKs runden leicht anders, verbindlich ist dein Zeugnis.</p>
        <h3 class="today-sub">Grundlage</h3>
        <p>Verordnung über die Berufsausbildung zum IT-System-Elektroniker und zur IT-System-Elektronikerin (ITSEAusbV) vom 28. Februar 2020, Paragraph 15 (Gewichtung und Bestehen) und Paragraph 16 (mündliche Ergänzungsprüfung). <a href="https://www.gesetze-im-internet.de/itseausbv/ITSEAusbV.pdf" target="_blank" rel="noopener">Verordnung als PDF</a>, 104 KB, oder <a href="https://www.gesetze-im-internet.de/itseausbv/BJNR026800020.html" target="_blank" rel="noopener">online lesen</a> auf gesetze-im-internet.de.</p>
      </div></section>`;
    const read = () => {
      const v = {};
      $$('[data-area]', app).forEach((inp) => {
        const x = T.num(inp.value); const bad = inp.value.trim() !== '' && (x === null || x < 0 || x > 100);
        inp.toggleAttribute('aria-invalid', bad); v[inp.dataset.area] = bad || x === null ? null : x;
      });
      return v;
    };
    const render = () => {
      const v = read(); store.set('ap2.grades', v);
      const r = T.assess(v); const filled = T.AREAS.length - r.open.length;
      const st = { ok: ['ok', 'erfüllt'], fail: ['bad', 'nicht mehr erreichbar'], open: ['', 'offen'] };
      $('#g-out').innerHTML = `<dl class="dl">${r.total !== undefined
        ? `<div><dt>Gesamtergebnis</dt><dd>${T.de(r.total, 1)}<small>Punkte, Note ${r.grade} (${r.word})</small></dd></div><div><dt>Ergebnis</dt><dd class="text ${r.passed ? 'ok' : 'bad'}">${r.passed ? 'Bestanden' : 'Nicht bestanden'}</dd></div>`
        : `<div><dt>Eingetragen</dt><dd>${filled}<small>von ${T.AREAS.length} Bereichen</small></dd></div><div><dt>Nächstes Ziel</dt><dd>${r.target !== null ? `${r.target}<small>Punkte in jedem offenen Bereich</small>` : '<small>Bestehen ist mit diesen Werten nicht mehr möglich</small>'}</dd></div>`}</dl>
        <h3 class="today-sub">Bestehensregeln</h3>
        <ul class="todo rules">${r.rules.map((x) => `<li><span>${esc(x.label)}</span><span class="tag ${st[x.state][0]}">${st[x.state][1]}</span></li>`).join('')}</ul>
        ${r.target !== null && r.open.length ? `<p class="small muted" style="margin-top:var(--space-sm)">${r.target} Punkte in jedem offenen Bereich reichen. Andere Verteilungen gehen auch, solange alle Regeln erfüllt sind.</p>` : ''}
        ${r.oral && r.oral.length ? `<div class="note" style="margin-top:var(--space-md)"><h4>Mündliche Ergänzungsprüfung</h4><p class="small">${r.oral.map((o) => `${esc(o.label)}: mit mindestens ${o.needed} Punkten in der mündlichen Prüfung wäre bestanden.`).join(' ')} Sie ist nur in einem Bereich möglich und muss beantragt werden.</p></div>` : ''}`;
    };
    $$('[data-area]', app).forEach((inp) => { inp.oninput = render; });
    $('#g-reset').onclick = () => { $$('[data-area]', app).forEach((inp) => { inp.value = ''; }); render(); };
    $('#g-prog').onclick = async () => {
      const p = await api('/api/progress'); let n = 0;
      p.readiness.forEach((r) => { const a = T.AREAS.find((x) => x.kind === r.kind); if (a && r.points !== null) { $(`#g-${a.id}`).value = r.points; n++; } });
      if (!n) toast('Noch keine Prognose. Bearbeite zuerst Teilaufgaben oder eine Prüfungssimulation.', true); else render();
    };
    render();
  }

  // ---------- Projekt und Fachgespräch ----------
  const mmss = (s) => `${s < 0 ? '−' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
  // Stoppuhr, die sich selbst beendet, sobald ihr Element nicht mehr auf der Seite ist
  function stopwatch(el, limit, warnAt, onTick) {
    let start = null, acc = 0, id = null;
    const now = () => acc + (start ? (Date.now() - start) / 1000 : 0);
    const draw = () => { const t = now(); el.textContent = mmss(limit - t); el.classList.toggle('warn', t >= warnAt && t < limit); el.classList.toggle('danger', t >= limit); if (onTick) onTick(t); };
    const tick = () => { if (!document.body.contains(el)) { clearInterval(id); return; } draw(); };
    return {
      running: () => !!start,
      start() { if (start) return; start = Date.now(); id = setInterval(tick, 250); draw(); },
      pause() { if (!start) return; acc = now(); start = null; clearInterval(id); draw(); },
      reset() { start = null; acc = 0; clearInterval(id); draw(); },
    };
  }
  async function projectView(tab) {
    tab = tab || 'start';
    setNav('project');
    const T = window.AP2Tools; const pr = store.get('ap2.project', {}); pr.checks = pr.checks || {}; pr.fg = pr.fg || {};
    const save = () => { store.set('ap2.project', pr); const st = $('#pj-stand'); if (st) st.innerHTML = standHtml(); };
    const days = pr.docDate ? Math.ceil((Date.parse(pr.docDate + 'T00:00') - Date.now()) / 864e5) : null;
    const rated = (r) => T.FG_QUESTIONS.filter((q) => pr.fg[q.id] && pr.fg[q.id].r === r).length;
    pr.form = pr.form || {}; pr.antrag = pr.antrag || {};
    const standHtml = () => `<div><dt><a href="#/projekt/antrag">Projektantrag</a></dt><dd>${T.ANTRAG.filter((_, i) => pr.antrag[i]).length}<small>von ${T.ANTRAG.length} Punkten erfüllt</small></dd></div><div><dt><a href="#/projekt/doku">Dokumentation</a></dt><dd>${T.DOC_CHECKLIST.filter((_, i) => pr.checks[i]).length + T.DOC_FORM.filter((_, i) => pr.form[i]).length}<small>von ${T.DOC_CHECKLIST.length + T.DOC_FORM.length} Punkten erledigt</small></dd></div>
          <div><dt><a href="#/projekt/fg">Fachgespräch</a></dt><dd>${rated('sicher')}<small>sicher, ${rated('unsicher')} unsicher, ${T.FG_QUESTIONS.length - rated('sicher') - rated('unsicher')} offen</small></dd></div>`;
    // Ein Abschnitt je Reiter; alle bleiben im DOM, damit Timer und Fragenkarte ihre Bindungen behalten
    app.innerHTML = `${subnav(PJ_TABS, tab)}<div class="page-head"><div><h1>${{ start: 'Projekt und Fachgespräch', antrag: 'Projektantrag prüfen', doku: 'Checkliste Dokumentation', praes: 'Präsentation üben', fg: 'Fachgespräch trainieren' }[tab]}</h1>${tab === 'start' ? '<p class="lede">Projektarbeit, Dokumentation, Präsentation und Fachgespräch zählen zusammen 50 % der Gesamtnote.</p>' : ''}</div></div>
      <div class="split" data-pj="start">
        <section class="sheet" aria-labelledby="pj-h"><h2 id="pj-h">Dein Projekt</h2>
          <div class="grade-list">
            <label class="field"><span>Projekttitel</span><input class="input" id="pj-title" type="text" value="${esc(pr.title || '')}" placeholder="z. B. Erweiterung des Serverraums mit USV und Unterverteilung"></label>
            <label class="field"><span>Kurzbeschreibung</span><textarea class="input" id="pj-desc" rows="3" placeholder="Auftrag, Kunde, Ziel in zwei Sätzen">${esc(pr.desc || '')}</textarea></label>
            <label class="field"><span>Abgabe der Dokumentation</span><input class="input date" id="pj-date" type="date" value="${esc(pr.docDate || '')}"></label>
          </div>
          ${days !== null ? `<p class="small muted" style="margin-top:var(--space-xs)">${days > 0 ? `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} bis zur Abgabe.` : days === 0 ? 'Abgabe ist heute.' : 'Der Abgabetermin ist vorbei.'}</p>` : ''}
        </section>
        <section aria-labelledby="pj-s-h"><h2 id="pj-s-h" class="visually-hidden">Stand</h2>
          <dl class="dl" id="pj-stand">${standHtml()}</dl>
          <details class="why" style="margin-top:var(--space-sm)"><summary>Wie zählt das?</summary><p class="small muted">Im Notenrechner zählt die Projektarbeit mit Dokumentation 30 %, Präsentation und Fachgespräch 20 % der Gesamtnote. Präsentation und Gespräch dauern zusammen höchstens 30 Minuten, die Präsentation höchstens 15. Die Vorgaben deiner IHK zu Umfang und Form der Dokumentation gehen vor.</p></details>
          <p class="actions" style="margin-top:var(--space-sm)"><a class="btn sm quiet" href="#/noten">Im Notenrechner eintragen</a></p>
        </section>
      </div>
      <section class="section" data-pj="antrag"><h2 id="pj-antrag">Projektantrag prüfen</h2>
        <p class="prose small muted">Bevor du den Antrag einreichst: Erfüllt dein Vorhaben, was ein Prüfungsprojekt ausmacht? Fehlt Projektcharakter oder fachliche Tiefe, lehnt die IHK den Antrag oft ab.</p>
        ${checklistHtml(T.ANTRAG, 'antrag', pr.antrag)}
      </section>
      <section class="section" data-pj="doku"><h2 id="pj-doku">Checkliste Dokumentation</h2>
        <h3 class="today-sub">Inhalt</h3>
        ${checklistHtml(T.DOC_CHECKLIST, 'doc', pr.checks)}
        <h3 class="today-sub">Form</h3>
        ${checklistHtml(T.DOC_FORM, 'form', pr.form)}
        <h4 style="margin-top:var(--space-md)">Mehr dazu</h4>
        <ul class="links"><li><a href="https://www.digitalklempner.de/unterrichtsmaterial/technische_dokumentation/projektdoku/" target="_blank" rel="noopener">Digitalklempner: Projektdokumentation</a> <span class="small muted">ausführlicher Leitfaden eines IT-Ausbilders</span></li><li><a href="https://www.digitalklempner.de/kursinfos/besuchswoche/" target="_blank" rel="noopener">Digitalklempner: Projektfindung und Projektantrag</a> <span class="small muted">Projektcharakter und fachliche Tiefe</span></li></ul>
      </section>
      <section class="section" data-pj="praes"><h2 id="pj-praes">Präsentation üben</h2>
        <div class="split">
          <div class="sheet"><p class="tag">Höchstens 15 Minuten</p><p class="clock" id="pt-clock" aria-live="off">15:00</p>
            <div class="actions"><button type="button" class="btn primary" id="pt-start">Start</button><button type="button" class="btn" id="pt-reset">Zurücksetzen</button></div>
            <p class="small muted" style="margin-top:var(--space-sm)">Ab 13 Minuten wird die Uhr gelb, nach 15 Minuten rot. Plane etwas Puffer ein, die 15 Minuten sind eine Obergrenze.</p></div>
          <div><h3 class="today-sub">Möglicher Ablauf</h3><ol class="outline" id="pt-outline">${T.TALK_OUTLINE.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
        </div>
      </section>
      <section class="section" data-pj="fg"><h2 id="pj-fg">Fachgespräch trainieren</h2>
        <div class="tools-row"><label class="field" style="min-width:min(100%, 18rem)"><span>Fragen</span><select class="input" id="fg-mode"><option value="open">Offene und unsichere zuerst</option><option value="all">Alle gemischt</option><option value="unsicher">Nur unsichere</option></select></label></div>
        <div class="sheet fg-card" id="fg-card" style="margin-top:var(--space-md)"></div>
        <details class="disc" style="margin-top:var(--space-md)"><summary>Alle ${T.FG_QUESTIONS.length} Fragen mit deinen Notizen</summary><div class="disc-body" id="fg-all"></div></details>
      </section>`;
    $$('[data-pj]', app).forEach((s) => { s.hidden = s.dataset.pj !== tab; const h = $(':scope > h2', s); if (h) h.classList.add('visually-hidden'); });  // Titel steht schon oben
    const bindField = (id, key) => { $(id).oninput = (ev) => { pr[key] = ev.target.value; save(); }; };
    bindField('#pj-title', 'title'); bindField('#pj-desc', 'desc');
    $('#pj-date').onchange = (ev) => { pr.docDate = ev.target.value; save(); projectView(tab); };
    $$('[data-doc]', app).forEach((c) => c.onchange = () => { pr.checks[c.dataset.doc] = c.checked; save(); checkCounts(); });
    $$('[data-form]', app).forEach((c) => c.onchange = () => { pr.form[c.dataset.form] = c.checked; save(); checkCounts(); });
    $$('[data-antrag]', app).forEach((c) => c.onchange = () => { pr.antrag[c.dataset.antrag] = c.checked; save(); checkCounts(); });
    checkCounts();
    // Präsentationstimer
    const steps = $$('#pt-outline li', app); const bounds = [1, 3, 5, 7, 11, 13, 15].map((m) => m * 60);
    const sw = stopwatch($('#pt-clock'), 900, 780, (t) => { const k = bounds.findIndex((b) => t < b); steps.forEach((li, i) => li.classList.toggle('now', i === (k < 0 ? steps.length - 1 : k))); });
    $('#pt-start').onclick = () => { if (sw.running()) { sw.pause(); $('#pt-start').textContent = 'Weiter'; } else { sw.start(); $('#pt-start').textContent = 'Pause'; } };
    $('#pt-reset').onclick = () => { sw.reset(); $('#pt-start').textContent = 'Start'; };
    // Fachgespräch
    const allList = () => { $('#fg-all').innerHTML = T.FG_QUESTIONS.map((q) => { const f = pr.fg[q.id] || {}; return `<div class="fg-row"><p><span class="tag${f.r === 'sicher' ? ' ok' : f.r === 'unsicher' ? ' warn' : ''}">${f.r || 'offen'}</span> <span class="small muted">${esc(q.cat)}</span><br>${esc(q.text)}</p>${f.note ? `<p class="small">${nl(f.note)}</p>` : ''}</div>`; }).join(''); };
    let current = null; let fgWatch = null;
    const pick = () => {
      const mode = $('#fg-mode').value; const r = (q) => (pr.fg[q.id] || {}).r;
      let pool = mode === 'unsicher' ? T.FG_QUESTIONS.filter((q) => r(q) === 'unsicher') : T.FG_QUESTIONS.filter((q) => q !== current);
      if (mode === 'open') { const pri = pool.filter((q) => r(q) !== 'sicher'); if (pri.length) pool = pri; }
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    };
    const show = () => {
      current = pick(); const card = $('#fg-card');
      if (!current) { card.innerHTML = '<p class="empty">Keine unsicheren Fragen mehr. Wähle „Alle gemischt“.</p>'; return; }
      const f = pr.fg[current.id] || {};
      card.innerHTML = `<p class="tag">${esc(current.cat)}</p><p class="fg-q">${esc(current.text)}</p>
        <div class="fg-tools"><span class="timer" id="fg-clock">2:00</span><button type="button" class="btn sm" id="fg-time">Antwortzeit starten</button></div>
        <label class="field" style="margin-top:var(--space-md)"><span>Deine Stichpunkte zur Antwort</span><textarea class="input" id="fg-note" rows="3" placeholder="Was willst du sagen? Bezug zu deinem Projekt?">${esc(f.note || '')}</textarea></label>
        <div class="actions" style="margin-top:var(--space-md)"><button type="button" class="btn" data-rate="sicher">Konnte ich sicher beantworten</button><button type="button" class="btn" data-rate="unsicher">War unsicher</button><button type="button" class="btn quiet" id="fg-next">Andere Frage</button></div>`;
      fgWatch = stopwatch($('#fg-clock'), 120, 100);
      $('#fg-time').onclick = () => { fgWatch.reset(); fgWatch.start(); };
      $('#fg-note').oninput = (ev) => { (pr.fg[current.id] = pr.fg[current.id] || {}).note = ev.target.value; save(); };
      $$('[data-rate]', card).forEach((b) => b.onclick = () => { (pr.fg[current.id] = pr.fg[current.id] || {}).r = b.dataset.rate; save(); allList(); show(); });
      $('#fg-next').onclick = show;
    };
    $('#fg-mode').onchange = show;
    allList(); show();
  }

  // ---------- Fachfragen (S.h.I.T. von Gerd Schiefer, data/fachfragen.json) ----------
  async function quizView() {
    setNav('quiz');
    const ff = await api('/api/fachfragen'); const cats = ff.categories;
    let on = new Set(store.get('ap2.settings', {}).ffCats || cats);
    const count = (i) => ff.questions.filter((q) => q.cats.includes(i)).length;
    app.innerHTML = `<div class="page-head"><div><h1>Fachfragen</h1><p class="lede">${ff.questions.length} Fragen wie im Fachgespräch und in den schriftlichen Teilen. Erst selbst antworten, dann die Lösung aufdecken.</p></div></div>
      <div class="sheet fg-card" id="ff-card"></div>
      <details class="disc" style="margin-top:var(--space-lg)"><summary>Kategorien</summary><div class="disc-body">
        <div class="actions"><button type="button" class="btn sm" data-ff-all="0">Keine</button><button type="button" class="btn sm" data-ff-all="1">Alle</button></div>
        <div class="ff-cats">${cats.map((c, i) => !count(i) ? '' : `<label class="check"><input type="checkbox" data-ff="${i}"${on.has(c) ? ' checked' : ''}><span>${esc(c)} <span class="small muted">${count(i)}</span></span></label>`).join('')}</div></div></details>
      ${ff.source ? `<p class="small muted" style="margin-top:var(--space-lg)">Fragen und Antworten aus <a href="${esc(ff.source.url)}" target="_blank" rel="noopener">S.h.I.T.</a> von ${esc(ff.source.author)}, abgerufen am ${esc(ff.source.date)}. Die Verwendung ist laut Autor frei.</p>` : ''}`;
    let cur = null;
    const show = () => {
      const pool = ff.questions.filter((q) => q.cats.some((i) => on.has(cats[i]))); const card = $('#ff-card');
      if (!pool.length) { card.innerHTML = '<p class="empty">Keine Kategorie gewählt. Wähle unter „Kategorien“ mindestens eine aus.</p>'; return; }
      const rest = pool.length > 1 ? pool.filter((q) => q !== cur) : pool; cur = rest[Math.floor(Math.random() * rest.length)];
      card.innerHTML = `<p class="tag">${esc(cur.cats.map((i) => cats[i]).join(', '))}</p><p class="fg-q">${nl(cur.q)}</p>
        <div class="actions"><button type="button" class="btn primary" id="ff-show" aria-expanded="false" aria-controls="ff-a">Lösung zeigen</button><button type="button" class="btn" id="ff-next">Neue Frage</button></div>
        <div class="ff-answer prose" id="ff-a" hidden><p>${nl(cur.a)}</p></div>
        <p class="small muted" style="margin-top:var(--space-md)">Frage ${pool.indexOf(cur) + 1} von ${pool.length} in deiner Auswahl</p>`;
      $('#ff-show').onclick = (ev) => { const a = $('#ff-a'); a.hidden = !a.hidden; ev.target.setAttribute('aria-expanded', !a.hidden); ev.target.textContent = a.hidden ? 'Lösung zeigen' : 'Lösung ausblenden'; };
      $('#ff-next').onclick = show;
    };
    const saveCats = () => { const s = store.get('ap2.settings', {}); s.ffCats = [...on]; store.set('ap2.settings', s); show(); };
    $$('[data-ff]', app).forEach((c) => c.onchange = () => { const n = cats[c.dataset.ff]; if (c.checked) on.add(n); else on.delete(n); saveCats(); });
    $$('[data-ff-all]', app).forEach((b) => b.onclick = () => { const all = b.dataset.ffAll === '1'; on = new Set(all ? cats : []); $$('[data-ff]', app).forEach((c) => { c.checked = all; }); saveCats(); });
    show();
  }

  // ---------- Rechentrainer ----------
  function drillStatsHtml() {
    const d = store.get('ap2.drill', {}); const T = window.AP2Tools; const rows = Object.entries(T.DRILLS).filter(([k]) => d[k] && d[k].n);
    return `<section class="section"><h2>Rechentrainer</h2>${rows.length ? rows.map(([k, x]) => meterRow(esc(x.name), d[k].ok / d[k].n, `${d[k].ok} von ${d[k].n} richtig`, '<a class="btn sm" href="#/rechnen">Üben</a>')).join('') : '<p class="empty">Noch keine Rechenaufgabe gelöst.</p>'}</section>`;
  }
  async function drillView() {
    setNav('drill');
    const T = window.AP2Tools; const st = store.get('ap2.settings', {}); const due = T.drillDue(store.get('ap2.drill', {}), Date.now());
    app.innerHTML = `<div class="page-head"><div><h1>Rechentrainer</h1><p class="lede">Rechenaufgaben wie in den schriftlichen Bereichen, jedes Mal mit neuen Werten und mit Lösungsweg. Kommazahlen mit Komma oder Punkt, Toleranz etwa 1 %.</p></div>
        <div class="actions"><label class="field" style="width:min(100%,22rem)"><span>Aufgabentyp</span><select class="input" id="r-type"><option value="">Gemischt</option>${due.length || st.drill === 'due' ? `<option value="due"${st.drill === 'due' ? ' selected' : ''}>Fällige Wiederholungen (${due.length})</option>` : ''}${Object.entries(T.DRILLS).map(([k, x]) => `<option value="${k}"${st.drill === k ? ' selected' : ''}>${esc(x.name)} (${kindShort(x.part)})</option>`).join('')}</select></label>
        <button type="button" class="btn calc-toggle" id="r-calc-btn" aria-controls="r-calc"${st.calcOff ? '' : ' hidden'}>Taschenrechner einblenden</button></div></div>
      <div class="drill-wrap${st.calcOff ? '' : ' with-calc'}"><div class="drill-main"><form class="sheet drill" id="r-form" novalidate></form>
        <section class="pad" id="r-pad" aria-label="Karopapier für Notizen">
          ${padHtml()}
        </section></div>
      <aside class="calc" id="r-calc" aria-label="Taschenrechner"${st.calcOff ? ' hidden' : ''}></aside></div>`;
    const next = () => {
      const sel = $('#r-type').value, pool = sel === 'due' ? T.drillDue(store.get('ap2.drill', {}), Date.now()) : [];
      const keys = pool.length ? pool : Object.keys(T.DRILLS);
      const type = sel && sel !== 'due' ? sel : keys[Math.floor(Math.random() * keys.length)];
      const task = T.DRILLS[type].make(Math.random); let counted = false;
      const f = $('#r-form');
      const lv = T.DRILLS[type].level, lvName = ['Leicht', 'Mittel', 'Schwer'][lv - 1];
      f.innerHTML = `<div class="drill-top"><p class="tag">${esc(T.DRILLS[type].name)}, ${esc(kindLabel(T.DRILLS[type].part))}</p>
        <span class="level" title="Schwierigkeit: ${lvName}"><span class="visually-hidden">Schwierigkeit: </span><span class="level-bars" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= lv ? ' class="on"' : ''}></i>`).join('')}</span>${lvName}</span></div>
        <p class="prose" style="margin-top:var(--space-xs)">${esc(task.text)}</p>
        <div class="drill-fields">${task.fields.map((x, i) => `<div class="field"><label for="r-f${i}">${esc(x.label)}${x.unit ? ` in ${esc(x.unit)}` : ''}</label><input class="input num" id="r-f${i}" type="text" inputmode="${x.exact ? 'text' : 'decimal'}" autocomplete="off"><span class="tag" id="r-s${i}" aria-live="polite"></span></div>`).join('')}</div>
        <div class="actions" style="margin-top:var(--space-md)"><button type="submit" class="btn primary">Prüfen</button><button type="button" class="btn" id="r-hint">Tipp</button><button type="button" class="btn" id="r-formula" aria-expanded="false" aria-controls="r-formulas">Formel</button><button type="button" class="btn" id="r-next">Nächste Aufgabe</button></div>
        <ol class="hints" id="r-hints" aria-live="polite"></ol>
        <div class="hints formulas-box" id="r-formulas" hidden><p class="small muted">Formeln zum Herleiten</p><ul>${T.DRILLS[type].formulas.map((x) => `<li><span class="formula">${esc(x)}</span></li>`).join('')}</ul></div>
        <details class="disc" id="r-steps" style="margin-top:var(--space-md)"><summary>Lösungsweg</summary><div class="disc-body prose"><ol>${task.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="why"><b>Warum?</b> ${esc(T.DRILLS[type].explain)}</p></div></details>`;
      f.onsubmit = (ev) => {
        ev.preventDefault(); let all = true;
        task.fields.forEach((x, i) => {
          const ok = T.checkField(x, $(`#r-f${i}`).value); all = all && ok; const s = $(`#r-s${i}`);
          s.className = `tag ${ok ? 'ok' : 'bad'}`; s.textContent = ok ? 'richtig' : `richtig wäre ${x.exact ?? T.de(x.value, 3)}${x.unit && !x.exact ? ' ' + x.unit : ''}`;
          $(`#r-f${i}`).toggleAttribute('aria-invalid', !ok);
        });
        if (!counted) { counted = true; const d = store.get('ap2.drill', {}); const e = d[type] || (d[type] = { n: 0, ok: 0 }); e.n++; if (all) e.ok++; T.drillReview(e, all, Date.now()); store.set('ap2.drill', d); }
        if (!all) $('#r-steps').open = true;
      };
      $('#r-next').onclick = next;
      $('#r-formula').onclick = (ev) => { const box = $('#r-formulas'); box.hidden = !box.hidden; ev.target.setAttribute('aria-expanded', !box.hidden); ev.target.textContent = box.hidden ? 'Formel' : 'Formel ausblenden'; };
      const hints = T.DRILLS[type].hints; let shown = 0;
      $('#r-hint').onclick = (ev) => {
        $('#r-hints').insertAdjacentHTML('beforeend', `<li>${esc(hints[shown++])}</li>`);
        ev.target.textContent = shown < hints.length ? `Noch ein Tipp (${shown} von ${hints.length})` : 'Alle Tipps gezeigt';
        ev.target.disabled = shown >= hints.length;
      };
      $('#r-f0').focus();
    };
    $('#r-type').onchange = (ev) => { const s = store.get('ap2.settings', {}); s.drill = ev.target.value; store.set('ap2.settings', s); next(); };
    // Taschenrechner rechts; der Knopf ist nur bei breitem Fenster sichtbar (style.css)
    // Taschenrechner ist bei breitem Fenster da (style.css); das Icon im Rechner blendet ihn aus, der Knopf oben wieder ein
    const showCalc = (on) => {
      $('#r-calc').hidden = !on; $('.drill-wrap').classList.toggle('with-calc', on); $('#r-calc-btn').hidden = on;
      const s = store.get('ap2.settings', {}); s.calcOff = !on; store.set('ap2.settings', s);
      (on ? $('#c-in') : $('#r-calc-btn')).focus();
    };
    $('#r-calc-btn').onclick = () => showCalc(true);
    $('#r-calc').addEventListener('click', (ev) => { if (ev.target.closest('[data-calc-close]')) showCalc(false); });
    calculator($('#r-calc'), st.calcMode === 'base' ? 'base' : 'calc');
    drawPad($('#r-pad'));
    next();
  }

  // Taschenrechner nach dem Vorbild des Casio fx-991DE CW; jede Taste nennt ihren Weg am Gerät (aus der Casio-Bedienungsanleitung)
  const CALC_KEYS = [
    ['sin', 'sin(', 'sin-Taste'], ['cos', 'cos(', 'cos-Taste'], ['tan', 'tan(', 'tan-Taste'], ['log', 'log(', 'SHIFT, x² (log). Mit Basis: log(2;16) über die Taste log■□'], ['ln', 'ln(', 'SHIFT, log■□ (ln)'],
    ['sin⁻¹', 'sin⁻¹(', 'SHIFT, sin (sin⁻¹)'], ['cos⁻¹', 'cos⁻¹(', 'SHIFT, cos (cos⁻¹)'], ['tan⁻¹', 'tan⁻¹(', 'SHIFT, tan (tan⁻¹)'], ['π', 'π', 'SHIFT, 7 (π)'], ['e', 'e', 'SHIFT, 8 (e)'],
    ['x²', '²', 'x²-Taste'], ['xʸ', '^', 'x^■-Taste'], ['x⁻¹', '⁻¹', 'SHIFT, x^■ (x⁻¹)'], ['√', '√(', '√-Taste'], ['ⁿ√', 'ⁿ√(', 'SHIFT, √ (ⁿ√): erst n, dann die Zahl. Hier ⁿ√(3;27)'],
    ['(', '('], [')', ')'], [';', ';', 'Trennt zwei Werte, hier in log(a;b) und ⁿ√(n;x)'], ['×10ˣ', '×10^', '×10^x-Taste'], ['Ans', 'Ans', 'Ans-Taste: letztes Ergebnis'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['←', 'back', 'Löschtaste'], ['AC', 'clear', 'AC-Taste'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×'], ['÷', '÷'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'], ['−', '−'],
    ['0', '0'], [',', ','], ['=', 'eq', 'EXE-Taste'],
  ];
  const BASE_KEYS = [
    ['and', ' and ', 'CATALOG, Logikoperatoren, and'], ['or', ' or ', 'CATALOG, Logikoperatoren, or'], ['xor', ' xor ', 'CATALOG, Logikoperatoren, xor'], ['xnor', ' xnor ', 'CATALOG, Logikoperatoren, xnor'], ['Not', 'Not(', 'CATALOG, Logikoperatoren, Not'],
    ['A', 'A', 'SHIFT, 4 (A)'], ['B', 'B', 'SHIFT, 5 (B)'], ['C', 'C', 'SHIFT, 6 (C)'], ['Neg', 'Neg(', 'CATALOG, Logikoperatoren, Neg'], ['←', 'back', 'Löschtaste'],
    ['D', 'D', 'SHIFT, 1 (D)'], ['E', 'E', 'SHIFT, 2 (E)'], ['F', 'F', 'SHIFT, 3 (F)'], ['(', '('], [')', ')'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷'], ['AC', 'clear', 'AC-Taste'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×'], ['−', '−'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'], ['Ans', 'Ans', 'Ans-Taste'],
    ['0', '0'], ['=', 'eq', 'EXE-Taste'],
  ];
  const CASIO_MORE = [['Ergebnis als Dezimalzahl', 'FORMAT, Dezimal (oder SHIFT, EXE für ≈)'], ['Ingenieurschreibweise (×10³, ×10⁻³ …)', 'FORMAT, ENG Notation'], ['Winkel in Grad', 'SETTINGS, Recheneinstell., Winkeleinheit, Gradmaß (D)'], ['Wert speichern', 'VARIABLE, A=, Speichern'], ['Zahlensysteme', 'HOME, Basis-N, OK'], ['Zahlensystem wechseln', 'FORMAT, dann Dezimal, Hexadezimal, Binär oder Oktal']];
  function calculator(box, mode) {
    const T = window.AP2Tools; let ans = 0, bans = 0, base = 10, fresh = false; // fresh: nach „=“ beginnt eine Ziffer neu, ein Operator rechnet mit Ans weiter
    const keys = (list) => list.map(([l, v, c]) => `<button type="button" class="btn${v === 'eq' ? ' primary eq' : ''}${l.length > 2 ? ' fn' : ''}" data-v="${esc(v)}"${c ? ` title="fx-991DE CW: ${esc(c)}"` : ''}>${esc(l)}</button>`).join('');
    const draw = () => {
      box.innerHTML = `<div class="calc-head"><div class="seg calc-mode" role="group" aria-label="Modus"><button type="button" class="btn sm" data-mode="calc" aria-pressed="${mode === 'calc'}">Rechnen</button><button type="button" class="btn sm" data-mode="base" aria-pressed="${mode === 'base'}" title="fx-991DE CW: HOME, Basis-N, OK">Basis-N</button></div><button type="button" class="btn icon-btn" data-calc-close aria-label="Taschenrechner ausblenden" title="Taschenrechner ausblenden">${icon('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
        ${mode === 'base' ? `<div class="seg calc-bases" role="group" aria-label="Zahlensystem der Eingabe">${Object.entries(T.BASES).map(([n, b]) => `<button type="button" class="btn sm" data-base="${b}" aria-pressed="${b === base}" title="fx-991DE CW: FORMAT, ${T.BASE_NAME[b]}">${n}</button>`).join('')}</div>` : ''}
        <label class="field"><span>${mode === 'base' ? `Eingabe ${T.BASE_NAME[base]}` : 'Rechnung'}</span><input class="input num" id="c-in" type="text" autocomplete="off" spellcheck="false" placeholder="${mode === 'base' ? 'z. B. 1010 and 1100' : 'z. B. 2 × 25 ÷ (56 × 1,5)'}"></label>
        <output class="calc-out" id="c-out" for="c-in" aria-live="polite"></output>
        <p class="calc-casio" id="c-casio">${mode === 'base' ? '32 Bit, negative Zahlen im Zweierkomplement.' : 'Winkel in Grad.'} Zeige auf eine Taste, um ihren Weg am fx-991DE CW zu sehen.</p>
        <div class="calc-keys">${keys(mode === 'base' ? BASE_KEYS : CALC_KEYS)}</div>
        <ol class="calc-hist" id="c-hist" aria-label="Verlauf"></ol>
        <details class="disc calc-more"><summary>Weitere Tastenwege am fx-991DE CW</summary><dl>${CASIO_MORE.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></details>`;
      const cin = $('#c-in', box), out = $('#c-out', box);
      const run = (x) => mode === 'base' ? T.baseCalc(x, base, bans) : T.calc(x, ans);
      const show = (v) => {
        out.classList.remove('bad');
        if (v === null || v === undefined) { out.innerHTML = '<span class="calc-main">0</span>'; return; }
        if (mode === 'base') { out.innerHTML = Object.entries(T.BASES).map(([n, b]) => `<span class="calc-row${b === base ? ' on' : ''}"><small>${n}</small>${b === 2 ? T.binGroups(T.toBase(v, 2)) : T.toBase(v, b)}</span>`).join(''); return; }
        const g = T.engNum(v);
        out.innerHTML = `<span class="calc-main">${T.fmtNum(v)}</span>${g.e ? `<span class="calc-row"><small>ENG</small>${g.text}${g.prefix ? ` (${g.prefix})` : ''}</span>` : ''}`;
      };
      const live = () => { try { show(run(cin.value)); } catch (e) { out.innerHTML = `<span class="calc-main">${cin.value ? '…' : '0'}</span>`; } };
      const equals = () => {
        try {
          const v = run(cin.value); if (v === null) return;
          if (mode === 'base') bans = v; else ans = v;
          $('#c-hist', box).insertAdjacentHTML('afterbegin', `<li><span>${esc(cin.value)}</span> = <b>${mode === 'base' ? T.toBase(v, base) : T.fmtNum(v)}</b></li>`);
          while ($('#c-hist', box).children.length > 6) $('#c-hist', box).lastElementChild.remove();
          show(v); fresh = true; cin.select();
        } catch (e) { out.innerHTML = `<span class="calc-err">${esc(e.message)}</span>`; out.classList.add('bad'); }
      };
      const put = (x) => {
        if (fresh) cin.value = /^\s?(and|or|xor|xnor)|^[×÷+−^²⁻]/.test(x) ? 'Ans' : ''; // wie am Gerät: Operator nach „=“ setzt Ans davor
        fresh = false;
        const a = cin.selectionStart ?? cin.value.length, b = cin.selectionEnd ?? a;
        cin.value = cin.value.slice(0, a) + x + cin.value.slice(b); cin.focus(); cin.setSelectionRange(a + x.length, a + x.length); live();
      };
      const enable = () => $$('[data-v]', box).forEach((b) => { if (mode === 'base' && /^[0-9A-F]$/.test(b.dataset.v)) b.disabled = parseInt(b.dataset.v, 16) >= base; });
      cin.oninput = () => { fresh = false; live(); };
      cin.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); equals(); } else if (ev.key === 'Escape') { cin.value = ''; live(); } };
      $$('[data-v]', box).forEach((b) => b.onclick = () => {
        const v = b.dataset.v;
        if (b.title) $('#c-casio', box).textContent = b.title;
        if (v === 'eq') equals();
        else if (v === 'clear') { cin.value = ''; fresh = false; live(); cin.focus(); }
        else if (v === 'back') { fresh = false; const a = cin.selectionStart ?? cin.value.length; if (a > 0) { cin.value = cin.value.slice(0, a - 1) + cin.value.slice(a); cin.focus(); cin.setSelectionRange(a - 1, a - 1); live(); } }
        else put(v);
      });
      $$('[data-mode]', box).forEach((b) => b.onclick = () => { mode = b.dataset.mode; const s = store.get('ap2.settings', {}); s.calcMode = mode; store.set('ap2.settings', s); draw(); $('#c-in', box).focus(); });
      // Zahlensystem wechseln: wie FORMAT am Gerät wird das aktuelle Ergebnis umgerechnet
      $$('[data-base]', box).forEach((b) => b.onclick = () => {
        let v = null; try { v = T.baseCalc(cin.value, base, bans); } catch (e) { /* unfertige Eingabe bleibt stehen */ }
        base = +b.dataset.base; const keep = v === null ? cin.value : T.toBase(v, base); draw(); $('#c-in', box).value = keep; $('#c-in', box).dispatchEvent(new Event('input'));
        $('#c-casio', box).textContent = b.title;
      });
      enable(); live();
    };
    draw();
  }

  const padBar = (pre = [], label = 'Zeichenwerkzeuge') => `<div class="pad-bar" role="toolbar" aria-label="${label}">${[...pre, ['pen', 'Stift', '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>'], ['erase', 'Radierer', '<path d="M5 15l9-9 5 5-8 8H8z"/><path d="M10 10l5 5"/><path d="M11 19h9"/>'], ['undo', 'Rückgängig', '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'], ['clear', 'Leeren', '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>']].map(([k, l, d]) => `<button type="button" class="btn icon-btn" data-pad="${k}" aria-label="${l}" title="${l}"${['text', 'pen', 'erase'].includes(k) ? ` aria-pressed="${k === (pre.length ? pre[0][0] : 'pen')}"` : ''}>${icon(d)}</button>`).join('')}</div>`;
  const padHtml = () => `${padBar()}
    <canvas role="img" aria-label="Zeichenfläche mit Karomuster"></canvas>`;

  // Werkzeugleiste beim Bearbeiten: Taschenrechner, Notizen (Karopapier), Belegsatz, Originalseite.
  // Ein Element je Sitzung, das nach jedem Neuzeichnen wieder eingehängt wird; so bleiben Notizen und Rechnungen erhalten.
  const TOOL_TABS = [['calc', 'Rechner'], ['pad', 'Notizen'], ['beleg', 'Belegsatz'], ['orig', 'Original'], ['ki', 'KI']];

  // ---------- KI-Lernpartner im Browser (WebLLM, WebGPU): kein Schlüssel, nach dem ersten Laden offline, nichts verlässt das Gerät ----------
  // Mit Grafikkarte (WebGPU) über WebLLM, sonst nur mit dem Prozessor über wllama (llama.cpp als WebAssembly, läuft auch in Firefox)
  const AI_LIB = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm';
  const AI_CPU_LIB = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js';
  const AI_CPU_WASM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm';
  // Online über Puter.js: kein Schlüssel in der Seite, du meldest dich mit einem kostenlosen Puter-Konto an; Anfragen gehen an Puter
  const AI_PUTER = 'https://js.puter.com/v2/';
  const AI_MODELS = [
    { id: 'online', online: true, label: 'Online, schnell (Puter, kostenloses Konto nötig)' },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', gpu: true, label: 'Grafikkarte: klein, schnell (etwa 1,6 GB)' },
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', gpu: true, label: 'Grafikkarte: mittel, besser (etwa 2,5 GB)' },
    { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', gpu: true, label: 'Grafikkarte: groß, am besten (etwa 5 GB)' },
    { id: 'cpu-0.5b', repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', label: 'Nur Prozessor: klein, flott (etwa 0,5 GB)' },
    { id: 'cpu-1.5b', repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', label: 'Nur Prozessor: besser, langsamer (etwa 1,1 GB)' },
  ];
  const ai = { engine: null, model: null, loading: null, gpu: undefined, chats: new Map() };
  // einheitlich: Antwort als Folge von Textstücken
  const aiStream = (msgs) => ai.engine.puter
    ? (async function* () { for await (const p of await window.puter.ai.chat(msgs, false, { stream: true, max_tokens: 700 })) { if (p && p.type === 'error') throw new Error(p.message || 'Fehler beim Online-Dienst'); if (p && p.text) yield { choices: [{ delta: { content: p.text } }] }; } })()
    : ai.engine.wllama
    ? ai.engine.wllama.createChatCompletion({ messages: msgs, stream: true, temperature: 0.4, max_tokens: 500 })
    : ai.engine.chat.completions.create({ messages: msgs, stream: true, temperature: 0.4, max_tokens: 600 });
  const aiPrompt = (item, ans) => [
    'Du bist ein geduldiger Lernpartner für die IHK-Abschlussprüfung der IT-System-Elektroniker/-innen. Antworte immer auf Deutsch, kurz, klar und fachlich korrekt.',
    'Stütze dich auf die offizielle Lösung unten. Wenn du etwas nicht sicher weißt, sag das, statt zu raten. Verrate die Lösung nicht ungefragt, wenn der Lernende noch übt: gib dann Hinweise und stelle Rückfragen.',
    `Aufgabe (${item.points} Punkte): ${item.text}`,
    item.solution ? `Offizielle Lösung: ${item.solution}` : '', item.expected ? `Erwartetes Ergebnis: ${item.expected} ${item.unit || ''}` : '', item.grading ? `Bewertungshinweis: ${item.grading}` : '',
    `Antwort des Lernenden: ${[(ans && ans.value) || '', (ans && ans.text) || ''].filter(Boolean).join(' | ') || '(noch keine)'}`,
  ].filter(Boolean).join('\n');
  const AI_ACTIONS = [['Aufgabe erklären', 'Erkläre mir, worum es in dieser Aufgabe geht und welches Wissen ich dafür brauche. Verrate die Lösung noch nicht.'],
    ['Antwort bewerten', 'Bewerte meine Antwort nach dem Bewertungshinweis mit Punkten. Sag kurz, was richtig ist, was fehlt und wie ich es verbessern kann.'],
    ['Abfragen', 'Stell mir eine Verständnisfrage zum Thema dieser Aufgabe und warte auf meine Antwort.']];
  function aiPanel(box, getCtx) {
    const st = store.get('ap2.settings', {});
    if (ai.gpu === undefined) { ai.gpu = null; (navigator.gpu ? navigator.gpu.requestAdapter().catch(() => null) : Promise.resolve(null)).then((a) => { ai.gpu = !!a; render(); }); }
    const render = () => {
      if (!ai.engine) {
        if (ai.gpu === null) { box.innerHTML = '<p class="small muted">Prüfe, was dieses Gerät kann …</p>'; return; }
        const models = AI_MODELS.filter((m) => ai.gpu || !m.gpu);
        const pick = models.find((m) => m.id === st.aiModel) ? st.aiModel : models[0].id;
        box.innerHTML = `<p class="small">Lernpartner, der die Aufgabe und die offizielle Lösung kennt.</p>
          <details class="ai-info"><summary>Wie funktioniert das?</summary><p class="small">„Online“ ist am schnellsten und braucht ein kostenloses Puter-Konto. Aufgabe, offizielle Lösung und deine Antwort gehen dabei an Puter und den KI-Anbieter. Die anderen Modelle laufen nur auf deinem Gerät und werden beim ersten Mal einmalig geladen.${ai.gpu ? '' : ' Hier gibt es keine nutzbare Grafikkarte (WebGPU), lokal geht deshalb nur der Prozessor: das antwortet langsam, oft ein paar Wörter pro Sekunde.'}</p></details>
          <label class="field"><span>Modell</span><select class="input" id="ai-model">${models.map((m) => `<option value="${m.id}"${pick === m.id ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
          <div class="actions" style="margin-top:var(--space-sm)"><button type="button" class="btn primary" id="ai-load"${ai.loading ? ' disabled' : ''}>KI laden</button>${ai.needLogin ? '<button type="button" class="btn" id="ai-login">Bei Puter anmelden</button>' : ''}</div>
          <p class="small muted" id="ai-progress" role="status">${ai.loading ? 'Wird geladen …' : ''}</p>
          <p class="small muted">Kleine Modelle können sich irren. Im Zweifel gilt die offizielle Lösung.</p>`;
        $('#ai-load', box).onclick = load;
        // Anmeldung direkt im Klick, sonst blockiert der Browser das Anmeldefenster
        if ($('#ai-login', box)) $('#ai-login', box).onclick = async () => { try { await window.puter.auth.signIn(); ai.needLogin = false; ai.engine = { puter: true }; ai.model = 'online'; render(); } catch (e) { toast('Anmeldung bei Puter abgebrochen', true); } };
        return;
      }
      const { item } = getCtx(); if (!item) { box.innerHTML = '<p class="small muted">Wähle eine Teilaufgabe.</p>'; return; }
      const log = ai.chats.get(item.id) || [];
      box.innerHTML = `<div class="ai-log" id="ai-log" aria-live="polite">${log.length ? log.map((m) => `<div class="ai-msg ${m.role}"><span class="small muted">${m.role === 'user' ? 'Du' : 'KI'}</span><p>${nl(m.content)}</p></div>`).join('') : '<p class="small muted">Frag etwas zu dieser Teilaufgabe oder nutze einen Knopf.</p>'}</div>
        <div class="actions ai-quick">${AI_ACTIONS.map(([l], i) => `<button type="button" class="btn sm" data-ai="${i}">${l}</button>`).join('')}</div>
        <form id="ai-form" class="ai-form"><label class="visually-hidden" for="ai-in">Nachricht an die KI</label><textarea class="input" id="ai-in" rows="2" placeholder="Deine Frage oder Antwort"></textarea><button type="submit" class="btn primary sm">Senden</button></form>
        <p class="small muted">${esc((AI_MODELS.find((m) => m.id === ai.model) || { label: ai.model }).label)}, läuft lokal. <button type="button" class="btn sm quiet" id="ai-reset">Gespräch neu</button></p>`;
      const lg = $('#ai-log', box); lg.scrollTop = lg.scrollHeight;
      $$('[data-ai]', box).forEach((b) => b.onclick = () => ask(AI_ACTIONS[+b.dataset.ai][1]));
      $('#ai-form', box).onsubmit = (ev) => { ev.preventDefault(); const t = $('#ai-in', box).value.trim(); if (t) ask(t); };
      $('#ai-in', box).onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('#ai-form', box).requestSubmit(); } };
      $('#ai-reset', box).onclick = () => { ai.chats.delete(item.id); render(); };
    };
    const load = async () => {
      const model = $('#ai-model', box).value; const s = store.get('ap2.settings', {}); s.aiModel = model; store.set('ap2.settings', s);
      const m = AI_MODELS.find((x) => x.id === model);
      ai.loading = true; render();
      const say = (t) => { const p = $('#ai-progress', box); if (p) p.textContent = t; };
      try {
        if (m.online) {
          if (!window.puter) await new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = AI_PUTER; sc.onload = ok; sc.onerror = () => fail(new Error('Puter ist nicht erreichbar')); document.head.append(sc); });
          if (window.puter.auth.isSignedIn()) ai.engine = { puter: true }; else ai.needLogin = true;
        } else if (m.gpu) {
          const webllm = await import(AI_LIB);
          ai.engine = await webllm.CreateMLCEngine(model, { initProgressCallback: (r) => say(r.text) });
        } else {
          const { Wllama } = await import(AI_CPU_LIB);
          const w = new Wllama({ default: AI_CPU_WASM });
          await w.loadModelFromHF({ repo: m.repo, file: m.file }, { n_ctx: 4096, progressCallback: ({ loaded, total }) => say(`Lade Modell: ${Math.round(loaded / 1e6)} von ${Math.round(total / 1e6)} MB`) });
          ai.engine = { wllama: w };
        }
        ai.model = model;
      } catch (e) { ai.engine = null; toast(`KI konnte nicht geladen werden: ${e.message}`, true); }
      ai.loading = null; render();
    };
    let busy = false;
    const ask = async (text) => {
      if (busy) return; busy = true;
      const { item, answer } = getCtx();
      const log = ai.chats.get(item.id) || []; ai.chats.set(item.id, log);
      log.push({ role: 'user', content: text }); const reply = { role: 'assistant', content: '' }; log.push(reply); render();
      const out = $$('.ai-msg.assistant p', box).pop();
      try {
        const msgs = [{ role: 'system', content: aiPrompt(item, answer()) }, ...log.slice(-10, -1).map((m) => ({ role: m.role, content: m.content }))];
        const chunks = await aiStream(msgs);
        for await (const c of chunks) { reply.content += (c.choices[0] && c.choices[0].delta && c.choices[0].delta.content) || ''; if (out && out.isConnected) { out.innerHTML = nl(reply.content); const lg = $('#ai-log', box); if (lg) lg.scrollTop = lg.scrollHeight; } }
      } catch (e) { reply.content = `Fehler: ${e.message}`; }
      busy = false; render();
    };
    return render;
  }
  function workTools(noCalc) {
    const st = store.get('ap2.settings', {});
    const el = document.createElement('aside'); el.className = 'tools'; el.id = 'w-tools'; el.setAttribute('aria-label', 'Werkzeuge');
    el.innerHTML = `<div class="tools-head"><div class="seg" role="tablist" aria-label="Werkzeug">${TOOL_TABS.map(([k, l]) => `<button type="button" class="btn sm" role="tab" data-tool="${k}" aria-selected="false">${l}</button>`).join('')}</div>
        <button type="button" class="btn icon-btn" data-tools-close aria-label="Werkzeuge ausblenden" title="Werkzeuge ausblenden">${icon('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
      <div class="tools-panel" data-panel="calc" hidden></div>
      <section class="pad tools-panel" data-panel="pad" hidden>${padHtml()}</section>
      <div class="tools-panel" data-panel="beleg" hidden></div>
      <div class="tools-panel" data-panel="orig" hidden></div>
      <div class="tools-panel ai" data-panel="ki" hidden></div>`;
    let aiRender = null, aiCtx = () => ({});
    if (!noCalc) calculator($('[data-panel="calc"]', el), st.calcMode === 'base' ? 'base' : 'calc');
    drawPad($('[data-panel="pad"]', el));
    const wide = matchMedia('(min-width: 64rem)'); // Rechner nur bei breitem Fenster, wie im Rechentrainer
    // Lernmodus (noCalc): eigene Einstellung, standardmäßig ausgeblendet, damit die Originalseite die Breite bekommt
    const offKey = noCalc ? 'learnToolsOff' : 'toolsOff';
    let part = null, item = null, tab = st.toolsTab || 'calc', shown = { beleg: null, orig: null }, off = noCalc ? st.learnToolsOff !== false : !!st.toolsOff;
    if (!matchMedia('(min-width: 84rem)').matches) off = true;  // schmaler: Werkzeuge liegen über der Seite, also erst auf Wunsch zeigen
    const has = (k) => k === 'calc' ? !noCalc && wide.matches : k === 'ki' ? !!noCalc : k === 'pad' ? true : k === 'beleg' ? !!(part && (part.attachments || []).some((a) => (a.pages && a.pages.length) || a.text)) : !!(part && part.page_images && part.page_images.length);
    const save = () => { const s = store.get('ap2.settings', {}); s.toolsTab = tab; s[offKey] = off; store.set('ap2.settings', s); };
    const show = (k, page) => {
      if (!has(k)) k = TOOL_TABS.map((t) => t[0]).find(has);
      tab = k;
      $$('[data-tool]', el).forEach((b) => { b.hidden = !has(b.dataset.tool); b.setAttribute('aria-selected', b.dataset.tool === k); b.classList.toggle('primary', b.dataset.tool === k); });
      $$('[data-panel]', el).forEach((p) => { p.hidden = p.dataset.panel !== k; });
      if (k === 'orig') {
        const want = page ?? Math.max(0, (item && item.page ? item.page : 1) - 1);
        const key = `${part.id}:${want}`;
        if (shown.orig !== key) { shown.orig = key; docViewer($('[data-panel="orig"]', el), part.page_images, { inline: true, zoom: 'width', start: want, printTitle: part.title }); }
      }
      if (k === 'beleg' && shown.beleg !== part.id) {
        shown.beleg = part.id; const box = $('[data-panel="beleg"]', el); const atts = (part.attachments || []).filter((a) => (a.pages && a.pages.length) || a.text);
        const one = (i) => { const a = atts[i]; const host = $('.beleg-body', box); if (a.pages && a.pages.length) docViewer(host, a.pages, { inline: true, zoom: 'width', printTitle: a.title || 'Belegsatz' }); else host.innerHTML = `<pre class="attachment">${esc(a.text)}</pre>`; };
        box.innerHTML = `${atts.length > 1 ? `<label class="field"><span>Anlage</span><select class="input" id="t-beleg">${atts.map((a, i) => `<option value="${i}">${esc(a.title || 'Belegsatz')}</option>`).join('')}</select></label>` : ''}<div class="beleg-body"></div>`;
        if (atts.length > 1) $('#t-beleg', box).onchange = (ev) => one(+ev.target.value);
        one(0);
      }
      save();
    };
    const apply = () => {
      const work = $('.work'); if (!work) return; el.hidden = off; work.classList.toggle('with-tools', !off); const b = $('#b-tools'); if (b) b.hidden = !off;
      // als Spalte daneben rückt die Übersicht zugeklappt nach oben; sonst wie gewohnt (breit offen)
      const nav = $('#navigator'); if (nav) nav.open = !off && matchMedia('(min-width: 84rem)').matches ? false : matchMedia('(min-width: 60.01rem)').matches;
    };
    $$('[data-tool]', el).forEach((b) => b.onclick = () => show(b.dataset.tool));
    $('[data-tools-close]', el).onclick = () => { off = true; save(); apply(); const b = $('#b-tools'); if (b) b.focus(); };
    wide.addEventListener('change', () => { if (el.isConnected) show(tab); });
    return {
      // nach jedem Neuzeichnen der Arbeitsansicht aufrufen
      // answer: Funktion, die die aktuelle Antwort liefert (für den KI-Lernpartner)
      mount(p, it, answer) {
        if (!part || part.id !== p.id) { shown = { beleg: null, orig: null }; }
        part = p; item = it;
        if (noCalc) { aiCtx = () => ({ item, answer: answer || (() => null) }); if (!aiRender) aiRender = aiPanel($('[data-panel="ki"]', el), () => aiCtx()); aiRender(); }
        $('.work').appendChild(el);
        const b = $('#b-tools'); if (b) b.onclick = () => { off = false; save(); apply(); show(tab); };
        $$('[data-orig]', app).forEach((x) => x.onclick = () => { off = false; apply(); show('orig', +x.dataset.orig); });
        apply(); show(tab);
      },
    };
  }

  // Karopapier für Randnotizen: Striche als Punktlisten, damit Größe und Hell/Dunkel neu gezeichnet werden können
  // strokes und onChange nur bei Skizzen-Antworten: dort wird die Zeichnung mit der Antwort gespeichert (box.strokes)
  function drawPad(box, strokes = [], onChange = () => {}) {
    const cv = $('canvas', box); let tool = 'pen', cur = null; box.strokes = strokes;
    const pen = (s) => {
      const g = cv.getContext('2d'), d = cv.width / (cv.clientWidth || 1);
      g.setTransform(d, 0, 0, d, 0, 0); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = getComputedStyle(cv).color;
      g.lineWidth = s.erase ? 20 : 2; g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; return g;
    };
    const line = (s, from) => { const g = pen(s), p = s.pts; g.beginPath(); g.moveTo(...p[Math.max(0, from - 1)]); for (let k = from; k < p.length; k++) g.lineTo(...p[k]); if (p.length === 1) g.lineTo(p[0][0] + 0.1, p[0][1]); g.stroke(); };
    const paint = () => { if (!cv.isConnected) return; const d = window.devicePixelRatio || 1; cv.width = Math.round(cv.clientWidth * d); cv.height = Math.round(cv.clientHeight * d); strokes.forEach((s) => line(s, 0)); };
    // shortcut: Punkte in CSS-Pixeln, auf einem deutlich schmaleren Gerät wird die Skizze rechts abgeschnitten; bei Bedarf relativ zur Breite speichern
    const at = (ev) => { const r = cv.getBoundingClientRect(); return [Math.round(ev.clientX - r.left), Math.round(ev.clientY - r.top)]; };
    cv.onpointerdown = (ev) => { cv.setPointerCapture(ev.pointerId); cur = { erase: tool === 'erase' || ev.button === 5, pts: [at(ev)] }; strokes.push(cur); line(cur, 0); };
    cv.onpointermove = (ev) => { if (!cur) return; cur.pts.push(at(ev)); line(cur, cur.pts.length - 1); };
    cv.onpointerup = cv.onpointercancel = () => { if (cur) onChange(); cur = null; };
    $$('[data-pad]', box).forEach((b) => b.onclick = () => {
      const a = b.dataset.pad;
      if (a === 'undo') { strokes.pop(); paint(); onChange(); } else if (a === 'clear') { strokes.length = 0; paint(); onChange(); }
      else { tool = a; $$('[data-pad="pen"], [data-pad="erase"]', box).forEach((x) => x.setAttribute('aria-pressed', x === b)); }
    });
    new ResizeObserver(paint).observe(cv);
    // Farbe folgt dem Thema: bei Wechsel neu zeichnen, solange die Seite offen ist
    const mo = new MutationObserver(() => cv.isConnected ? paint() : mo.disconnect()); mo.observe(document.documentElement, { attributes: true });
    const mq = matchMedia('(prefers-color-scheme: dark)'); const f = () => cv.isConnected ? paint() : mq.removeEventListener('change', f); mq.addEventListener('change', f);
  }

  // Ausfüllen auf der Originalseite: Text an die angeklickte Stelle, Stift und Radierer. Koordinaten relativ zur Seite (0 bis 1),
  // damit alles bei jeder Breite an derselben Stelle steht. own = { boxes: [{ x, y, t, n }], strokes: [{ erase, pts, n }] } wird
  // verändert; others sind die Einträge anderer Teilaufgaben auf derselben Seite und werden nur angezeigt.
  // fields = [{ area, value }] sind die Eingabefelder der Teilaufgabe (Zellen, Antwortlinien); others = [{ marks, fields }]
  // pen = { target(x, y) -> { strokes, changed }, all() -> [strokes ...] }: Stiftmodus, jeder Strich gehört zum Feld, in dem er beginnt
  function markPage(host, src, own, others, onChange, fields = [], pen = null) {
    host.innerHTML = `${padBar(pen ? [] : [['text', 'Text schreiben', '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>']], 'Auf der Seite ausfüllen')}
      <div class="mark-page${pen ? ' pen' : ''}"><img alt="Originalseite der Aufgabe" draggable="false"><canvas aria-hidden="true"></canvas><canvas aria-hidden="true"></canvas></div>
      <p class="small muted">${pen ? 'Mit dem Stift direkt in die Felder schreiben, mit dem Finger scrollen. Die Handschrift wird bei der Auswertung gelesen.' : fields.length ? 'In die umrandeten Felder klicken und die Antwort schreiben. Mit „Text schreiben“ geht es zusätzlich an jeder anderen Stelle der Seite.' : '„Text schreiben“ wählen, in die Seite klicken, zum Beispiel auf eine Antwortlinie, und tippen. Leere Felder verschwinden wieder.'}</p>`;
    const page = $('.mark-page', host), img = $('img', page), [cvO, cv] = $$('canvas', page);
    let tool = pen ? 'pen' : 'text', cur = null, curTarget = null;
    const line = (c, s, from) => {
      const g = c.getContext('2d'), w = c.width, h = c.height, p = s.pts;
      g.lineCap = g.lineJoin = 'round'; g.strokeStyle = getComputedStyle(page).color; g.lineWidth = w * (s.erase ? 0.022 : 0.0022);
      g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      g.beginPath(); g.moveTo(p[Math.max(0, from - 1)][0] * w, p[Math.max(0, from - 1)][1] * h);
      for (let k = from; k < p.length; k++) g.lineTo(p[k][0] * w, p[k][1] * h);
      if (p.length === 1) g.lineTo(p[0][0] * w + 0.5, p[0][1] * h);
      g.stroke();
    };
    const box = (b, ro) => {
      const el = document.createElement(ro ? 'div' : 'textarea');
      el.className = `mark-text${ro ? ' ro' : ''}`; el.style.left = `${b.x * 100}%`; el.style.top = `${b.y * 100}%`;
      if (ro) { el.textContent = b.t; page.append(el); return el; }
      el.value = b.t; el.rows = 1; el.spellcheck = false; el.setAttribute('aria-label', 'Eintrag auf der Seite');
      const fit = () => { el.rows = Math.max(1, el.value.split('\n').length); };
      el.oninput = () => { b.t = el.value; fit(); onChange(); };
      el.onblur = () => { if (!el.value.trim()) { own.boxes.splice(own.boxes.indexOf(b), 1); el.remove(); onChange(); } };
      el.onpointerdown = (ev) => ev.stopPropagation();
      fit(); page.append(el); return el;
    };
    const paint = () => {
      if (!page.isConnected) return;
      page.style.setProperty('--u', `${page.clientWidth / 100}px`); page.style.setProperty('--ph', `${page.clientHeight}px`);
      [cvO, cv].forEach((c) => { c.width = page.clientWidth * (window.devicePixelRatio || 1); c.height = page.clientHeight * (window.devicePixelRatio || 1); });
      others.forEach((o) => ((o.marks || {}).strokes || []).forEach((s) => line(cvO, s, 0)));
      (pen ? pen.all() : [own.strokes]).forEach((list) => list.forEach((s) => line(cv, s, 0)));
    };
    others.forEach((o) => ((o.marks || {}).boxes || []).forEach((b) => box(b, true))); own.boxes.forEach((b) => box(b));
    // Antwortlinien (lh): Zeilenhöhe = Linienabstand, damit die Schrift auf den gedruckten Linien steht; Zellen: eine Zeile mittig
    const fieldEl = (f, ro) => {
      if (pen && !ro) ro = true;  // Stiftmodus: Felder nur als Umrandung, geschrieben wird darüber
      if (f.area.tick) {  // Ankreuzfeld: Klick setzt oder entfernt das Kreuz
        const el = document.createElement(ro ? 'div' : 'button');
        el.className = `mark-tick${ro ? ' ro' : ''}`;
        Object.assign(el.style, { left: `${f.area.x * 100}%`, top: `${f.area.y * 100}%`, width: `${f.area.w * 100}%`, height: `${f.area.h * 100}%` });
        const show = () => { el.textContent = f.value ? '✕' : ''; if (!ro) el.setAttribute('aria-pressed', String(!!f.value)); };
        if (!ro) {
          el.type = 'button'; el.setAttribute('aria-label', `Ankreuzen: ${f.text || f.area.label || f.area.key}`);
          el.onpointerdown = (ev) => ev.stopPropagation();
          el.onclick = () => { f.value = f.value ? '' : 'X'; show(); (f.onChange || onChange)(); };
          if (f.other) el.classList.add('other');
        }
        if (pen) el.classList.add('zone'); else show();  // im Stiftmodus zeigt die Tinte das Kreuz
        page.append(el); return el;
      }
      const el = document.createElement(ro ? 'div' : 'textarea');
      if (pen) el.classList.add('zone');
      el.className = `mark-field${ro ? ' ro' : ''}${f.area.lh ? ' lined' : ''}`;
      Object.assign(el.style, { left: `${f.area.x * 100}%`, top: `${f.area.y * 100}%`, width: `${f.area.w * 100}%`, height: `${f.area.h * 100}%` });
      el.style.setProperty('--lh', f.area.lh || Math.min(f.area.h, 0.03));
      if (ro) el.textContent = pen ? '' : f.value || '';
      else {
        el.value = f.value || ''; el.spellcheck = false; el.setAttribute('aria-label', f.other ? `Antwortfeld zu ${f.other}` : 'Antwortfeld dieser Teilaufgabe');
        if (f.other) { el.classList.add('other'); el.title = `Gehört zu ${f.other}`; }
        el.oninput = () => { f.value = el.value; (f.onChange || onChange)(); }; el.onpointerdown = (ev) => ev.stopPropagation();
      }
      page.append(el); return el;
    };
    others.forEach((o) => (o.fields || []).forEach((f) => { if (f.value) fieldEl(f, true); }));
    const els = fields.map((f) => fieldEl(f)), mine = els.filter((e, i) => !fields[i].other);
    if (pen) {
      // Finger scrollt, Stift schreibt: Safari meldet den Apple Pencil als „stylus“, nur dann wird das Scrollen verhindert
      page.addEventListener('touchstart', (ev) => { if ([...ev.touches].some((t) => t.touchType === 'stylus')) ev.preventDefault(); }, { passive: false });
      page.addEventListener('touchmove', (ev) => { if ([...ev.touches].some((t) => t.touchType === 'stylus')) ev.preventDefault(); }, { passive: false });
    }
    const at = (ev) => { const r = page.getBoundingClientRect(); return [+((ev.clientX - r.left) / r.width).toFixed(4), +((ev.clientY - r.top) / r.height).toFixed(4)]; };
    page.onpointerdown = (ev) => {
      if (pen && ev.pointerType === 'touch') return;  // Finger: scrollen
      if (tool === 'text') {
        ev.preventDefault(); const [x, y] = at(ev);
        const b = { x, y: Math.max(0, y - 0.012), t: '', n: Date.now() }; own.boxes.push(b); box(b).focus(); return;
      }
      const p0 = at(ev);
      curTarget = pen ? pen.target(p0[0], p0[1]) : { strokes: own.strokes, changed: onChange };
      try { page.setPointerCapture(ev.pointerId); } catch (e) { /* ohne Capture weiterzeichnen */ }
      cur = { erase: tool === 'erase' || ev.button === 5, pts: [p0], n: Date.now() }; curTarget.strokes.push(cur); line(cv, cur, 0);
    };
    page.onpointermove = (ev) => {
      if (!cur) return;
      const p = at(ev), q = cur.pts[cur.pts.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.0015) return;  // dichter als 1,5 ‰ der Seite bringt nichts, kostet aber Speicher
      cur.pts.push(p); line(cv, cur, cur.pts.length - 1);
    };
    page.onpointerup = page.onpointercancel = () => { if (cur) { if (curTarget.ratio) curTarget.ratio(page.clientHeight / page.clientWidth); curTarget.changed(); } cur = null; };
    $$('[data-pad]', host).forEach((b) => b.onclick = () => {
      const a = b.dataset.pad;
      if (a === 'undo' || a === 'clear') {
        if (pen) {
          // Stift: Rückgängig nimmt den letzten Strich auf der Seite, Leeren alle Striche der gewählten Teilaufgabe
          if (a === 'clear') own.strokes.length = 0;
          else { const lists = pen.all(); let best = null; lists.forEach((l) => { const s = l[l.length - 1]; if (s && (!best || s.n > best[1].n)) best = [l, s]; }); if (best) { best[0].pop(); const t = pen.target(...best[1].pts[0]); if (t) t.changed(); } }
          paint(); onChange(); return;
        }
        if (a === 'clear') { own.boxes.length = 0; own.strokes.length = 0; }
        else { const lb = own.boxes[own.boxes.length - 1], ls = own.strokes[own.strokes.length - 1]; if (lb && (!ls || lb.n > ls.n)) own.boxes.pop(); else own.strokes.pop(); }
        $$('textarea.mark-text', page).forEach((t) => t.remove()); own.boxes.forEach((x) => box(x)); paint(); onChange();
      } else { tool = a; page.dataset.tool = a; $$('[aria-pressed]', host).forEach((x) => x.setAttribute('aria-pressed', x === b)); }
    });
    page.dataset.tool = tool;
    img.onload = () => { page.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; paint(); };
    window.AP2Local.pageSrc(src).then((u) => { img.src = u; }).catch(() => { img.alt = 'Seite konnte nicht geladen werden'; });
    new ResizeObserver(paint).observe(page);
    return mine[0] || null;
  }

  // Antworten auf der Originalseite (Lern- und Prüfungsmodus): Feld im Antwortbereich, dazu freie Einträge mit Text und Stift.
  // Gibt collect(prev) zurück; ohne Änderung bleibt die bisherige Antwort (auch eine aus der Textfassung) unverändert.
  const origPage = (item) => (item.fields && item.fields.length && item.fields[0].page) || item.page;
  // Feldinhalte einer Antwort; eine Antwort aus der Textfassung landet im ersten Feld
  const fieldValues = (item, a) => (item.fields || []).map((f, i) => (a.fields || [])[i] ?? (f.tick ? ((a.selected || []).includes(f.key) ? 'X' : '') : i === 0 && !a.fields && !a.marks ? (a.text || '') : ''));
  // Alle Felder der Seite sind beschreibbar; jedes gehört zu seiner Teilaufgabe. Text und Stift gehören zur gewählten Teilaufgabe.
  // collect(prev) liefert die Antwort der gewählten Teilaufgabe, others() die geänderten Antworten der übrigen auf dieser Seite.
  const penMode = () => { const m = store.get('ap2.settings', {}).inputMode; return m ? m === 'pen' : matchMedia('(pointer: coarse)').matches; };
  // Antwort aus Feldern, Kreuzen und Einträgen bilden (gemeinsam für Tastatur, Stift und Handschrift-Erkennung)
  function answerFrom(it, all, marks, prev) {
    // Kreuze zählen mit ihrer Bedeutung (Antwortmöglichkeit oder „Zeile: Spalte“), damit Stichworte und Lösung greifen
    const text = [...all.map((f) => f.area.tick ? (f.value ? f.text || '' : '') : (f.value || '').trim()), ...((marks || {}).boxes || []).map((b) => b.t.trim()), (marks && marks.free) || ''].filter(Boolean).join('\n');
    const ans = Object.assign({}, prev, { text });
    if (marks) ans.marks = marks;
    if (all.length) ans.fields = all.map((f) => f.value || '');
    const keys = all.filter((f) => f.area.tick && f.area.key && f.value).map((f) => f.area.key);
    if (all.some((f) => f.area.tick && f.area.key)) { ans.selected = keys; ans.value = keys.join(', '); return ans; }
    const t = it.answer_type;
    // shortcut: Ergebnis einer Rechenaufgabe = letzte Zahl im Geschriebenen; ein eigenes Ergebnisfeld wäre genauer
    if (t === 'number') { const m = text.match(/-?\d+(?:[.,]\d+)*/g); ans.value = m ? m[m.length - 1] : ''; }
    if (['choice', 'multi_choice', 'assignment', 'order'].includes(t)) { ans.value = text; ans.selected = []; }
    return ans;
  }
  function origAnswer(host, part, item, items, getA, onChange) {
    const pg = origPage(item), pen = penMode();
    const groups = items.filter((x) => x.item.id === item.id || (x.item.fields || []).some((f) => f.page === pg)).map((x) => {
      const it = x.item, a = getA(it.id), vals = fieldValues(it, a);
      const optText = (k) => ((it.options || []).find((o) => o.key === k) || {}).text;
      return { it, a, dirty: false, marks: JSON.parse(JSON.stringify(a.marks || { boxes: [], strokes: [] })), all: (it.fields || []).map((f, i) => ({ area: f, value: vals[i], text: f.key ? optText(f.key) : f.label })) };
    });
    const me = groups.find((g) => g.it.id === item.id);
    const own = me.marks;
    const fields = [];
    groups.forEach((g) => g.all.filter((f) => f.area.page === pg).forEach((f) => {
      if (g !== me) f.other = `Teilaufgabe ${g.it.label || g.it.id}`;
      f.onChange = () => { g.dirty = true; onChange(); };
      fields.push(f);
    }));
    const others = items.filter((x) => x.item.id !== item.id && origPage(x.item) === pg).map((x) => ({ marks: getA(x.item.id).marks }));
    const inside = (f, x, y) => x >= f.area.x && x <= f.area.x + f.area.w && y >= f.area.y && y <= f.area.y + f.area.h;
    const penCfg = pen ? {
      target: (x, y) => { const f = fields.find((ff) => inside(ff, x, y)); const g = f ? groups.find((gg) => gg.all.includes(f)) : me; return { strokes: g.marks.strokes, changed: () => { g.dirty = true; onChange(); }, ratio: (r) => { g.marks.ar = +r.toFixed(4); } }; },
      all: () => groups.map((g) => g.marks.strokes),
    } : null;
    const el = markPage(host, part.page_images[pg - 1], own, pen ? others : others, () => { me.dirty = true; onChange(); }, fields, penCfg);
    const build = (g, prev) => answerFrom(g.it, g.all, g.marks, prev);
    const collect = (prev) => (me.dirty ? build(me, prev) : prev);
    const changed = () => groups.filter((g) => g !== me && g.dirty).map((g) => { g.dirty = false; return [g.it.id, build(g, getA(g.it.id))]; });
    return { collect, others: changed, field: el };
  }

  // ---------- Handschrift lesen (Stiftmodus) ----------
  // Kreuze: Anteil Tinte im Kästchen. Text: Ausschnitt je Feld als Bild an eine KI mit Bilderkennung (Puter, Konto des Lernenden).
  const strokeBox = (s) => { const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  function inkImage(strokes, r, W = 1400, ratio = 1.414) {
    // r in Seitenanteilen; Seite W Pixel breit, Höhe aus dem Seitenformat
    const H = W * ratio, pad = 0.004, x0 = Math.max(0, r[0] - pad), y0 = Math.max(0, r[1] - pad), x1 = r[2] + pad, y1 = r[3] + pad;
    const c = document.createElement('canvas'); c.width = Math.max(8, Math.round((x1 - x0) * W)); c.height = Math.max(8, Math.round((y1 - y0) * H));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.lineCap = g.lineJoin = 'round';
    strokes.forEach((s) => {
      g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; g.strokeStyle = '#000'; g.lineWidth = W * (s.erase ? 0.022 : 0.0026);
      g.beginPath(); s.pts.forEach((p, i) => { const X = (p[0] - x0) * W, Y = (p[1] - y0) * H; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); if (s.pts.length === 1) g.lineTo((s.pts[0][0] - x0) * W + 1, (s.pts[0][1] - y0) * H);
      g.stroke();
    });
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  const inkShare = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n / (d.length / 4); };
  async function readInk(canvas) {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const r = await window.puter.ai.chat('Auf dem Bild steht eine handschriftliche Antwort aus einer IHK-Prüfung (IT-Berufe). Gib den geschriebenen Text genau so wieder, wie er dasteht, mit Zeilenumbrüchen, ohne zu korrigieren oder zu erklären. Zahlen, Einheiten und Abkürzungen genau übernehmen. Steht nichts Lesbares da, antworte mit einem leeren Text.', new File([blob], 'antwort.png', { type: 'image/png' }));
    const c = r && r.message ? r.message.content : r;
    return (Array.isArray(c) ? c.map((x) => x.text || '').join('') : String(c || '')).trim();
  }
  async function puterReady(interactive) {
    if (!window.puter) await new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = AI_PUTER; sc.onload = ok; sc.onerror = () => fail(new Error('Puter ist nicht erreichbar')); document.head.append(sc); });
    if (!window.puter.auth.isSignedIn() && interactive) await window.puter.auth.signIn();
    return window.puter.auth.isSignedIn();
  }
  // Liest die Striche einer Antwort neu, wenn sie sich seit dem letzten Lesen geändert haben; gibt die neue Antwort zurück oder null
  async function penRead(it, a) {
    const strokes = ((a && a.marks) || {}).strokes || [];
    const stamp = strokes.length ? `${strokes.length}:${strokes[strokes.length - 1].n}` : '';
    if (!stamp || a.ink === stamp) return null;
    const ok = await puterReady(false).catch(() => false);
    const vals = fieldValues(it, a), fs = it.fields || [];
    const optText = (k) => ((it.options || []).find((o) => o.key === k) || {}).text;
    const all = fs.map((f, i) => ({ area: f, value: vals[i], text: f.key ? optText(f.key) : f.label }));
    const used = new Set(), ar = a.marks.ar || 1.414;  // Seitenverhältnis Höhe/Breite, quer gescannte Seiten < 1
    for (const f of all) {
      const mine = strokes.filter((s) => { const b = strokeBox(s), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= f.area.x && cx <= f.area.x + f.area.w && cy >= f.area.y && cy <= f.area.y + f.area.h; });
      if (!mine.length) continue;
      mine.forEach((s) => used.add(s));
      const r = [f.area.x, f.area.y, f.area.x + f.area.w, f.area.y + f.area.h];
      if (f.area.tick) { f.value = inkShare(inkImage(mine, r, 600, ar)) > 0.04 ? 'X' : ''; continue; }
      if (ok) f.value = await readInk(inkImage(mine, r, 1400, ar));
    }
    const rest = strokes.filter((s) => !used.has(s) && !s.erase);
    const marks = Object.assign({}, a.marks);
    if (rest.length && ok) { const bs = rest.map(strokeBox); marks.free = await readInk(inkImage(rest, [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))], 1400, ar)); }
    const ans = answerFrom(it, all, marks, a);
    if (ok || !all.some((f) => !f.area.tick)) ans.ink = stamp;  // ohne Anmeldung nur Kreuze gelesen: beim nächsten Mal Text nachholen
    return ans;
  }
  // alle Antworten eines Teils lesen und speichern (vor der Abgabe oder dem Stichwort-Check)
  async function penReadAll(sid, view, part, onlyItem) {
    const list = flatItems(part).map((x) => x.item).filter((it) => !onlyItem || it.id === onlyItem);
    let n = 0, done = 0;
    for (const it of list) {
      const a = view.session.answers[answerKey(part.id, it.id)];
      if (!a || !a.marks || !(a.marks.strokes || []).length) continue;
      n++; toast(`Handschrift wird gelesen (${n})`);
      try { const ans = await penRead(it, a); if (ans) { view.session.answers[answerKey(part.id, it.id)] = ans; await post(`/api/sessions/${sid}/answer`, { part: part.id, item: it.id, answer: ans }); done++; } }
      catch (e) { toast(`Handschrift konnte nicht gelesen werden: ${e.message}`, true); }
    }
    return done;
  }

  // ---------- Bewertung nach Kriterien (aus dem Bewertungshinweis) ----------
  function critHtml(item, a, key, hidden) {
    const cr = window.AP2Tools.criteria(item); if (!cr) return '';
    const on = a.criteria || [];
    return `<fieldset class="criteria" data-crit="${key}"${hidden && !on.length ? ' hidden' : ''}><legend>Bewertung nach Kriterien</legend>
      ${cr.map((c, i) => `<label class="check"><input type="checkbox" data-ci="${i}"${on.includes(i) ? ' checked' : ''}><span>${esc(c.label)} <span class="tag">${fmtPts(c.points)} ${c.points === 1 ? 'Punkt' : 'Punkte'}</span></span></label>`).join('')}
      <p class="small muted">Hake ab, was deine Antwort enthält. Die Punkte werden daraus übernommen.</p></fieldset>`;
  }
  function critPoints(fs, item) {
    const cr = window.AP2Tools.criteria(item); const idx = $$('input[data-ci]', fs).filter((x) => x.checked).map((x) => +x.dataset.ci);
    return { idx, pts: Math.min(item.points, idx.reduce((s, i) => s + cr[i].points, 0)) };
  }

  // ---------- Gemeinsames: Antwortfelder ----------
  function answerKey(part, item) { return `${part}/${item}`; }
  function getAnswer(view, partId, itemId) {
    return view.session.answers[answerKey(partId, itemId)] || { text: '', value: '', selected: [], cells: [], self_points: null, hints_used: 0, flagged: false };
  }
  function answerIsEmpty(a) {
    return !a || (!(a.text || '').trim() && !(a.value || '').trim() && !(a.selected || []).length && !(a.sketch || []).length && !(a.cells || []).some((r) => r.some((c) => (c || '').trim())));
  }

  function renderAnswerInput(item, a, readonly) {
    const ro = readonly ? 'disabled' : '';
    const t = item.answer_type;
    let html = '';
    if (t === 'choice' || t === 'multi_choice') {
      html += `<fieldset class="options"><legend class="visually-hidden">Antwortvorgaben</legend>${item.options.map((o) => `<label><input type="${t === 'choice' ? 'radio' : 'checkbox'}" name="opt" value="${esc(o.key)}" ${a.selected.includes(o.key) ? 'checked' : ''} ${ro}><span class="key">${esc(o.key)}</span><span>${nl(o.text)}</span></label>`).join('')}</fieldset>`;
      if (t === 'multi_choice') html += '<p class="small muted">Mehrere Antworten möglich. Die Aufgabe nennt die Anzahl.</p>';
    } else if (t === 'assignment' || t === 'order') {
      html += `<div class="options">${item.options.map((o) => `<div class="opt"><span class="key">${esc(o.key)}</span><span>${nl(o.text)}</span></div>`).join('')}</div>
        <label class="field" style="width:min(100%,22rem)"><span>Lösungsziffern in der richtigen Reihenfolge</span><input type="text" class="input num ans-value" inputmode="numeric" autocomplete="off" value="${esc(a.value)}" placeholder="3, 1, 4, 2" ${ro}></label>`;
    } else if (t === 'number') {
      html += `<div class="row-fields"><label class="field"><span>Ergebnis${item.unit ? ` in ${esc(item.unit)}` : ''}</span><input type="text" class="input num ans-value" inputmode="decimal" autocomplete="off" value="${esc(a.value)}" placeholder="0,00" ${ro}></label></div>
        <label class="field"><span>Rechenweg (wird in der Prüfung bewertet)</span><textarea class="input ans-text" ${ro}>${esc(a.text)}</textarea></label>`;
    } else if (t === 'table' && item.table) {
      const tab = item.table;
      const cells = a.cells || [];
      html += `<div class="answer-table-wrap"><table class="answer-table"><thead><tr>${tab.columns.map((c) => `<th scope="col">${nl(c)}</th>`).join('')}</tr></thead><tbody>
        ${tab.rows.map((r, ri) => `<tr>${r.map((c, ci) => (c || '').trim() ? `<td>${nl(c)}</td>` : `<td><input type="text" class="input ans-cell" aria-label="${esc(tab.columns[ci] || 'Zelle')}, Zeile ${ri + 1}" data-r="${ri}" data-c="${ci}" value="${esc((cells[ri] || [])[ci] || '')}" ${ro}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <label class="field"><span>Ergänzungen oder Begründung (optional)</span><textarea class="input ans-text" style="min-height:4.5rem" ${ro}>${esc(a.text)}</textarea></label>`;
    } else if (t === 'sketch') {
      html += `${ro ? '' : `<section class="pad ans-pad" aria-label="Zeichenfläche für die Skizze">${padHtml()}</section>`}<label class="field"><span>Stichworte zur Skizze (für den Stichwort-Check)</span><textarea class="input ans-text" ${ro}>${esc(a.text)}</textarea></label><p class="small muted">Zeichne auf dem Karopapier, die Zeichnung wird mit der Antwort gespeichert. Die Stichworte nennen, was die Skizze zeigt, zum Beispiel Bauteile und Verbindungen.</p>`;
    } else {
      html += `<label class="field"><span>Deine Antwort</span><textarea class="input ans-text" placeholder="Stichworte genügen, wenn keine ganzen Sätze gefordert sind" ${ro}>${esc(a.text)}</textarea></label>`;
    }
    return html;
  }

  function collectAnswer(container, item, prev) {
    const a = Object.assign({}, prev, { selected: [], cells: [] });
    const t = item.answer_type;
    if (t === 'choice' || t === 'multi_choice') a.selected = $$('input[name=opt]:checked', container).map((i) => i.value);
    const v = container.querySelector('.ans-value');
    if (v) a.value = v.value;
    const tx = container.querySelector('.ans-text');
    if (tx) a.text = tx.value;
    const pad = container.querySelector('.ans-pad');
    if (pad) a.sketch = pad.strokes;
    if (t === 'table' && item.table) {
      a.cells = item.table.rows.map((r, ri) => r.map((c, ci) => {
        const inp = container.querySelector(`.ans-cell[data-r="${ri}"][data-c="${ci}"]`);
        return inp ? inp.value : (c || '');
      }));
    }
    return a;
  }

  function flatItems(part) {
    const out = [];
    part.tasks.forEach((t) => t.items.forEach((i) => out.push({ task: t, item: i })));
    return out;
  }

  const wide = () => matchMedia('(min-width: 60.01rem)').matches;
  // Nebenaktionen der Arbeitsansicht in einem Menü, damit oben nur das Nötige steht
  const moreMenu = (inner) => `<details class="more-menu"><summary class="btn sm">Mehr</summary><div class="menu">${inner}</div></details>`;
  const bindMoreMenu = () => $$('.more-menu .menu > *').forEach((b) => b.addEventListener('click', () => { b.closest('details').open = false; }));
  document.addEventListener('click', (ev) => $$('.more-menu[open]').forEach((d) => { if (!d.contains(ev.target)) d.open = false; }));
  function navigatorHtml(view, partId, current, summary) {
    const exam = view.exam;
    const part = exam.parts.find((p) => p.id === partId);
    const order = view.session.part_order;
    return `<details class="navigator" id="navigator" ${wide() ? 'open' : ''}>
      <summary><span>Aufgaben</span><span class="pos-text">${summary}</span></summary>
      <div class="nav-body">
      <div class="tabs" role="tablist" aria-label="Prüfungsteile">${order.map((pid) => { const p = exam.parts.find((x) => x.id === pid); const st = view.session.parts.find((s) => s.part_id === pid); return `<button type="button" role="tab" data-part="${pid}" aria-selected="${pid === partId}" title="${esc(p.title)}">${kindShort(p.kind)}${st && st.finished_at ? ' (abgegeben)' : ''}</button>`; }).join('')}</div>
      ${part.kind === 'WiSo'
        ? `<div class="task"><div class="task-title">30 Aufgaben <span class="num">${part.max_points} P.</span></div><div class="items">${part.tasks.map((t) => t.items.map((i) => itemBtn(view, partId, t, i, current, true)).join('')).join('')}</div></div>`
        : part.tasks.map((t) => `<div class="task"><div class="task-title">${t.number}. ${esc(t.title || 'Aufgabe')} <span class="num">${t.points} P.</span></div><div class="items">${t.items.map((i) => itemBtn(view, partId, t, i, current, false)).join('')}</div></div>`).join('')}
      <div class="legend" aria-hidden="true"><span>beantwortet</span><span style="--sw:var(--color-success)">volle Punkte</span><span style="--sw:var(--color-warn)">teilweise</span><span style="--sw:var(--color-error)">0 Punkte</span></div>
      <div class="material">
        ${part.situation ? '<button type="button" class="btn sm quiet" id="sb-situation">Ausgangssituation</button>' : ''}
        ${(part.attachments || []).map((att, i) => `<button type="button" class="btn sm quiet" data-sb-att="${i}">${esc(att.title || 'Belegsatz')}</button>`).join('')}
        ${part.page_images && part.page_images.length ? '<button type="button" class="btn sm quiet" id="sb-pages">Originalseiten</button>' : ''}
      </div></div></details>`;
  }

  function itemBtn(view, partId, t, i, current, isWiso) {
    const a = view.session.answers[answerKey(partId, i.id)];
    let cls = '';
    let stateText = 'offen';
    if (a && a.self_points !== null && a.self_points !== undefined) { cls = a.self_points >= i.points ? 'graded-ok' : a.self_points > 0 ? 'graded-part' : 'graded-bad'; stateText = `${fmtPts(a.self_points)} von ${fmtPts(i.points)} Punkten`; }
    else if (!answerIsEmpty(a)) { cls = 'answered'; stateText = 'beantwortet'; }
    const label = isWiso ? t.number : (i.label || i.id);
    return `<button type="button" class="itembtn ${cls} ${a && a.flagged ? 'flagged' : ''}" data-item="${i.id}" ${i.id === current ? 'aria-current="step"' : ''} aria-label="${isWiso ? 'Aufgabe ' + t.number : 'Aufgabe ' + t.number + ' ' + esc(i.label)}, ${stateText}${a && a.flagged ? ', markiert' : ''}">${esc(label)}</button>`;
  }

  function bindNavigator(view, partId, onPart, onItem) {
    const part = view.exam.parts.find((p) => p.id === partId);
    $$('[data-part]', app).forEach((b) => b.onclick = () => onPart(b.dataset.part));
    $$('[data-item]', app).forEach((b) => b.onclick = () => onItem(b.dataset.item));
    const sit = $('#sb-situation');
    if (sit) sit.onclick = () => openModal(`<h2 id="modal-title">Ausgangssituation</h2><div class="situation">${nl(part.situation)}</div>`, true);
    $$('[data-sb-att]', app).forEach((b) => b.onclick = () => {
      const att = part.attachments[+b.dataset.sbAtt];
      openModal(`<h2 id="modal-title">${esc(att.title || 'Belegsatz')}</h2>${att.pages && att.pages.length ? `<button type="button" class="btn sm" id="att-pages">Seiten als Bild ansehen (${att.pages.length})</button>` : ''}${att.text ? `<pre class="attachment">${esc(att.text)}</pre>` : '<p class="empty">Kein Textauszug vorhanden.</p>'}`, true);
      const ap = $('#att-pages');
      if (ap) ap.onclick = () => pageViewer(att.pages, 0, att.title || 'Belegsatz');
    });
    const pg = $('#sb-pages');
    if (pg) pg.onclick = () => pageViewer(part.page_images, 0, 'Originalprüfung');
  }

  function sheetHtml(part, task, item, idx, total, inner, cls = '') {
    const figure = item.needs_figure && item.figure_pages && item.figure_pages.length && part.page_images && part.page_images.length
      ? `<p class="fig-link" style="margin-top:var(--space-sm)"><button type="button" class="btn sm" data-fig="${item.figure_pages[0] - 1}">Abbildung ansehen (Originalseite ${item.figure_pages.join(', ')})</button></p>` : '';
    return `<article class="exam-sheet${cls}" aria-labelledby="task-h">
      <div class="body">
        <div class="task-head"><h2 id="task-h">${part.kind === 'WiSo' ? `Aufgabe ${task.number}` : `${task.number}. Aufgabe${task.title ? `: ${esc(task.title)}` : ''}`}</h2><span class="num">${task.points} Punkte</span></div>
        ${task.intro && part.kind !== 'WiSo' ? `<div class="task-intro">${nl(task.intro)}</div>` : ''}
        <div class="item-head"><p class="item-text">${item.label ? `<span class="item-label">${esc(item.label)}</span>` : ''}${nl(item.text)}</p><span class="item-points-inline">${ptsLabel(item.points)}</span></div>
        ${figure}${item.page && !item.needs_figure && part.page_images && part.page_images.length ? `<p class="orig-link"><button type="button" class="btn sm quiet" data-orig="${item.page - 1}">Originalseite ${item.page} ansehen</button></p>` : ''}
        ${inner}
      </div>
      <aside class="rand" aria-label="Korrekturrand"><span>Korrekturrand</span><span class="pts">${fmtPts(item.points)}<small>${+item.points === 1 ? 'Punkt' : 'Punkte'}</small></span><span class="num">${idx + 1} / ${total}</span></aside>
    </article>`;
  }

  // Eingabe umschalten; beim Wechsel auf Stift im selben Klick bei Puter anmelden (sonst blockiert der Browser das Fenster)
  async function togglePen(saveFn, rerender) {
    await saveFn();
    const s = store.get('ap2.settings', {}), pen = !penMode(); s.inputMode = pen ? 'pen' : 'keys'; store.set('ap2.settings', s);
    rerender();
    if (pen) {
      try { if (window.puter && !window.puter.auth.isSignedIn()) await window.puter.auth.signIn(); else if (!window.puter) { const ok = await puterReady(false); if (!ok) toast('Zum Lesen der Handschrift einmal bei Puter anmelden: im KI-Tab oder hier erneut auf „Eingabe“ tippen.'); } }
      catch (e) { toast('Ohne Puter-Anmeldung werden nur Kreuze ausgewertet, keine Handschrift.', true); }
    }
  }

  // ---------- Lernmodus ----------
  async function learnView(sid) {
    setNav('exams');
    const view = await api(`/api/sessions/${sid}`);
    if (view.session.mode === 'exam') { location.hash = `#/exam/${sid}`; return; }
    state.view = view;
    const stKey = `learn-pos-${sid}`;
    let pos = JSON.parse(sessionStorage.getItem(stKey) || 'null') || { part: view.session.part_order[0], item: null };
    if (!view.exam.parts.find((p) => p.id === pos.part)) pos.part = view.session.part_order[0];
    const tools = workTools(true); // im Lernmodus ohne Rechner, wie auf dem Papier
    let lastPage = null; // Teil und Seite der zuletzt gezeigten Teilaufgabe: gleiche Seite = Scrollposition behalten

    const renderLearn = (focusSheet) => {
      const y = scrollY;
      const part = view.exam.parts.find((p) => p.id === pos.part);
      const items = flatItems(part);
      let idx = items.findIndex((x) => x.item.id === pos.item);
      if (idx < 0) idx = 0;
      pos.item = items[idx].item.id;
      sessionStorage.setItem(stKey, JSON.stringify(pos));
      const { task, item } = items[idx];
      const a = getAnswer(view, part.id, item.id);
      const hintsUsed = a.hints_used || 0;
      const isText = item.answer_type === 'text' || item.answer_type === 'table' || item.answer_type === 'sketch';
      const where = `${kindShort(part.kind)}, ${part.kind === 'WiSo' ? 'Aufgabe ' + task.number : task.number + ' ' + (item.label || '')}`;
      // Auf der Originalseite ausfüllen, wenn die Seite der Teilaufgabe bekannt ist (Einstellung learnText schaltet auf die Textfassung)
      const canOrig = !!(origPage(item) && part.page_images && part.page_images[origPage(item) - 1]);
      const onOrig = canOrig && !store.get('ap2.settings', {}).learnText;
      app.innerHTML = `<div class="work-head"><div class="where"><span class="mode">Lernmodus, ${esc(kindShort(part.kind))}</span><h1>${esc(view.exam.title)}</h1></div>
          <div class="actions">${moreMenu(`<button type="button" class="btn sm quiet" id="b-tools" hidden>Werkzeuge</button>${onOrig ? `<button type="button" class="btn sm quiet" id="b-input" aria-pressed="${penMode()}">Eingabe: ${penMode() ? 'Stift' : 'Tastatur'}</button>` : ''}${canOrig ? `<button type="button" class="btn sm quiet" id="b-view">${onOrig ? 'Als Text ausfüllen' : 'Auf dem Original ausfüllen'}</button>` : ''}<a class="btn sm quiet" href="#/result/${sid}">Zwischenstand</a>${pdfLink(`/api/sessions/${sid}/pdf?parts=${part.id}`, 'PDF mit Antworten')}${pdfLink(`/api/exams/${view.exam.id}/pdf?parts=${part.id}`, 'PDF Prüfungsbogen')}`)}</div></div>
        <div class="work">${navigatorHtml(view, part.id, item.id, `${esc(where)}, ${idx + 1} von ${items.length}`)}
        <div>
          ${sheetHtml(part, task, item, idx, items.length, `
            <div class="answer${onOrig ? ' mark-host' : ''}" id="answer-area">${onOrig ? '' : renderAnswerInput(item, a, false)}</div>
            <div class="tool-row">
              <button type="button" id="b-check" class="btn primary">${isText || onOrig ? 'Stichwort-Check' : 'Antwort prüfen'}</button>
              <details class="assist"${hintsUsed ? ' open' : ''}><summary class="btn">Hilfe</summary><span class="assist-body">
              <button type="button" id="b-hint1" class="btn" ${hintsUsed >= 1 ? 'hidden' : ''}>Tipp 1: Ansatz</button>
              <button type="button" id="b-hint2" class="btn" ${hintsUsed >= 2 || hintsUsed < 1 ? 'hidden' : ''}>Tipp 2: konkreter</button>
              <button type="button" id="b-hint3" class="btn" ${hintsUsed >= 3 || hintsUsed < 2 ? 'hidden' : ''}>Tipp 3: fast die Lösung</button>
              <button type="button" id="b-solution" class="btn quiet">Musterlösung</button></span></details>
              <button type="button" id="b-flag" class="btn sm" aria-pressed="${!!a.flagged}">${a.flagged ? 'Markiert' : 'Markieren'}</button>
              <span class="save-state" id="save-state" role="status"></span>
            </div>
            <div id="hints"></div>
            <div id="feedback" aria-live="polite"></div>
            ${critHtml(item, a, 'learn', true)}
            <details class="sg-more"><summary>Punkte selbst anpassen</summary>
            <div class="selfgrade" id="selfgrade">
              <label class="field"><span>Selbstbewertung</span><input class="input num" type="number" min="0" max="${item.points}" step="0.5" id="sg-points" value="${a.self_points ?? ''}" placeholder="0 bis ${fmtPts(item.points)}"></label>
              <span class="small muted" style="padding-bottom:var(--space-xs)">von ${ptsLabel(item.points)}</span>
              <button type="button" class="btn sm" id="sg-full">Volle Punkte</button><button type="button" class="btn sm" id="sg-zero">0 Punkte</button><button type="button" class="btn sm" id="sg-save">Übernehmen</button>
            </div></details>
            <div id="topicbox"></div>`, onOrig ? ' learn on-orig' : ' learn')}
          <div class="pager"><button type="button" class="btn" id="b-prev" ${idx === 0 ? 'disabled' : ''}>Vorherige</button><span class="pos">${idx + 1} / ${items.length}</span><button type="button" class="btn" id="b-next">${idx === items.length - 1 ? 'Nächster Teil' : 'Nächste'}</button></div>
        </div></div>`;
      // Operatoren im Aufgabentext markieren und erklären (nur Lernmodus)
      const itx = $('.item-text');
      if (itx) { const m = window.AP2Tools.markOps(itx.innerHTML); itx.innerHTML = m.html; if (m.ops.length) itx.closest('.item-head').insertAdjacentHTML('afterend', `<details class="ops"><summary>Verlangt: ${m.ops.map((o) => o.op[0].toUpperCase() + o.op.slice(1)).join(', ')}${m.ops.length > 1 ? `, also ${m.ops.length} Teilleistungen` : ''}</summary><ul>${m.ops.map((o) => `<li>${esc(o.hint)}</li>`).join('')}</ul></details>`); }
      const samePage = onOrig && lastPage === `${part.id}:${origPage(item)}`;
      lastPage = onOrig ? `${part.id}:${origPage(item)}` : null;
      if (focusSheet) { $('#task-h').setAttribute('tabindex', '-1'); $('#task-h').focus({ preventScroll: samePage }); }
      const go = { part: (pid) => { pos = { part: pid, item: null }; renderLearn(true); }, item: (iid) => { pos.item = iid; renderLearn(true); } };
      bindNavigator(view, part.id, go.part, go.item);

      // Antworten speichern (verzögert)
      let saveTimer = null;
      const area = $('#answer-area');
      if (item.answer_type === 'sketch' && $('.ans-pad', area)) drawPad($('.ans-pad', area), getAnswer(view, part.id, item.id).sketch || [], () => area.dispatchEvent(new Event('change')));
      // Auf dem Original: Feld und Einträge sind die Antwort (Stichwort-Check, Auswertung)
      const orig = onOrig ? origAnswer(area, part, item, items, (id) => getAnswer(view, part.id, id), () => area.dispatchEvent(new Event('input'))) : null;
      const collect = () => { const prev = getAnswer(view, part.id, item.id); return orig ? orig.collect(prev) : collectAnswer(area, item, prev); };
      const save = async () => {
        const ans = collect();
        view.session.answers[answerKey(part.id, item.id)] = ans;
        setSave('speichert …');
        try {
          await post(`/api/sessions/${sid}/answer`, { part: part.id, item: item.id, answer: ans });
          for (const [iid, oa] of orig ? orig.others() : []) { view.session.answers[answerKey(part.id, iid)] = oa; await post(`/api/sessions/${sid}/answer`, { part: part.id, item: iid, answer: oa }); }
          setSave('gespeichert');
        } catch (e) { setSave('Nicht gespeichert: ' + e.message); }
      };
      area.addEventListener('input', () => { clearTimeout(saveTimer); setSave('…'); saveTimer = setTimeout(save, 600); });
      area.addEventListener('change', () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 100); });

      const renderTopics = (topics) => {
        $('#topicbox').innerHTML = topics.map((t) => `<div class="panel"><h4>Nachschlagen: ${esc(t.name)} <a class="small" href="#/wiki/thema/${slugify(`${t.part} ${t.name}`)}" target="_blank" rel="noopener">im Wiki öffnen</a></h4><p>${esc(t.summary)}</p>${t.key_points && t.key_points.length ? `<ul>${t.key_points.slice(0, 6).map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}${t.formulas && t.formulas.length ? `<div>${t.formulas.map((f) => `<span class="formula">${esc(f)}</span>`).join('')}</div>` : ''}${figuresHtml(t)}${linksHtml(t)}</div>`).join('');
      };
      const showHints = (upTo) => {
        // Hinweise kommen vom Server (zeichnet die Nutzung auf)
        $('#hints').innerHTML = '';
        const load = async (lvl) => {
          const h = await post(`/api/sessions/${sid}/hint`, { part: part.id, item: item.id, level: lvl });
          const div = document.createElement('div');
          div.className = 'panel hint';
          div.innerHTML = `<h4>Tipp ${lvl}</h4><p>${nl(h.hint)}</p>`;
          $('#hints').appendChild(div);
          if (lvl === upTo && h.topics && h.topics.length) renderTopics(h.topics);
        };
        return (async () => { for (let l = 1; l <= upTo; l++) await load(l); })();
      };
      if (hintsUsed > 0) showHints(hintsUsed);
      const hintClick = (lvl) => async () => {
        await save();
        const ans = getAnswer(view, part.id, item.id);
        ans.hints_used = Math.max(ans.hints_used || 0, lvl);
        view.session.answers[answerKey(part.id, item.id)] = ans;
        await showHints(lvl);
        $('#b-hint1').hidden = lvl >= 1;
        $('#b-hint2').hidden = lvl >= 2 || lvl < 1;
        $('#b-hint3').hidden = lvl >= 3 || lvl < 2;
        const next = $(`#b-hint${lvl + 1}`);
        if (next) next.focus({ preventScroll: true });
      };
      $('#b-hint1').onclick = hintClick(1);
      $('#b-hint2').onclick = hintClick(2);
      $('#b-hint3').onclick = hintClick(3);

      const showSolution = (r) => {
        const sol = r.solution || item.solution || '';
        const exp = r.expected || item.expected || '';
        const fs = $('[data-crit="learn"]'); if (fs) fs.hidden = false;
        $('#feedback').insertAdjacentHTML('beforeend', `<div class="panel solution"><h4>Musterlösung${exp ? `: ${esc(exp)} ${esc(r.unit || item.unit || '')}` : ''}</h4>${nl(sol || 'Keine Lösungshinweise hinterlegt.')}${(r.grading || item.grading) ? `<p class="grading">Bewertung: ${esc(r.grading || item.grading)}</p>` : ''}</div>`);
      };
      $('#b-check').onclick = async () => {
        await save();
        $('#b-check').disabled = true;
        if (onOrig && penMode()) await penReadAll(sid, view, part, item.id);
        try {
          const r = await post(`/api/sessions/${sid}/check`, { part: part.id, item: item.id });
          const c = r.check;
          const cls = c.correct === true ? 'ok' : c.correct === false ? 'bad' : '';
          $('#feedback').innerHTML = `<div class="panel ${cls}"><h4>${esc(c.message)}</h4>
            ${c.keywords && c.keywords.length ? `<div class="kws">${c.keywords.map((k) => `<span class="kw ${k.hit ? 'hit' : 'miss'}">${esc(k.keyword)}</span>`).join('')}</div><p class="grading">Durchgestrichen heißt: in deiner Antwort nicht gefunden. Vergleiche mit der Musterlösung und trage deine Punkte ein.</p>` : ''}</div>`;
          if (c.auto_points !== null && c.auto_points !== undefined) {
            $('#sg-points').value = c.auto_points;
            await post(`/api/sessions/${sid}/self-grade`, { part: part.id, item: item.id, points: c.auto_points });
            const ans = getAnswer(view, part.id, item.id); ans.self_points = c.auto_points; view.session.answers[answerKey(part.id, item.id)] = ans;
          } else if (c.suggested_points !== undefined && c.keywords && c.keywords.length) {
            $('#sg-points').value = c.suggested_points;
          }
          showSolution(r);
          refreshNavigator();
        } catch (e) { toast(e.message, true); }
        $('#b-check').disabled = false;
      };
      $('#b-solution').onclick = async () => {
        await save();
        const r = await post(`/api/sessions/${sid}/check`, { part: part.id, item: item.id });
        $('#feedback').innerHTML = '';
        showSolution(r);
      };
      $('#b-flag').onclick = async () => {
        const ans = collect();
        ans.flagged = !ans.flagged;
        view.session.answers[answerKey(part.id, item.id)] = ans;
        await post(`/api/sessions/${sid}/answer`, { part: part.id, item: item.id, answer: ans });
        $('#b-flag').setAttribute('aria-pressed', String(ans.flagged));
        $('#b-flag').textContent = ans.flagged ? 'Markiert' : 'Markieren';
        refreshNavigator();
      };
      const saveGrade = async (pts, crit) => {
        try {
          await post(`/api/sessions/${sid}/self-grade`, { part: part.id, item: item.id, points: pts, criteria: crit });
          const ans = getAnswer(view, part.id, item.id); ans.self_points = pts; if (crit) ans.criteria = crit; else delete ans.criteria; view.session.answers[answerKey(part.id, item.id)] = ans;
          toast(pts === null ? 'Bewertung entfernt' : `${fmtPts(pts)} Punkte übernommen`);
          refreshNavigator();
        } catch (e) { toast(e.message, true); }
      };
      $('#sg-save').onclick = () => { const v = $('#sg-points').value; saveGrade(v === '' ? null : Math.min(item.points, Math.max(0, +v.replace(',', '.')))); };
      $('#sg-full').onclick = () => { $('#sg-points').value = item.points; saveGrade(item.points); };
      $('#sg-zero').onclick = () => { $('#sg-points').value = 0; saveGrade(0); };
      const critBox = $('[data-crit="learn"]');
      if (critBox) critBox.onchange = () => { const r = critPoints(critBox, item); $('#sg-points').value = r.pts; saveGrade(r.pts, r.idx); };
      const refreshNavigator = () => {
        const nav = $('#navigator');
        if (!nav) return;
        const wasOpen = nav.open;
        nav.outerHTML = navigatorHtml(view, part.id, item.id, `${esc(where)}, ${idx + 1} von ${items.length}`);
        $('#navigator').open = wasOpen;
        bindNavigator(view, part.id, go.part, go.item);
      };
      $('#b-prev').onclick = async () => { await save(); pos.item = items[idx - 1].item.id; renderLearn(true); };
      $('#b-next').onclick = async () => {
        await save();
        if (idx < items.length - 1) { pos.item = items[idx + 1].item.id; renderLearn(true); }
        else {
          const order = view.session.part_order; const pi = order.indexOf(part.id);
          if (pi < order.length - 1) { pos = { part: order[pi + 1], item: null }; renderLearn(true); }
          else location.hash = `#/result/${sid}`;
        }
      };
      $$('[data-fig]', app).forEach((b) => b.onclick = () => pageViewer(part.page_images, +b.dataset.fig, 'Abbildung zur Aufgabe'));
      if ($('#b-view')) $('#b-view').onclick = async () => { await save(); const s = store.get('ap2.settings', {}); s.learnText = onOrig; store.set('ap2.settings', s); renderLearn(true); };
      if ($('#b-input')) $('#b-input').onclick = () => togglePen(save, () => renderLearn(true));
      bindMoreMenu();
      tools.mount(part, item, collect);
      // erst jetzt: die Seite steht. Mit Antwortfeld dorthin, sonst auf derselben Seite die Stelle behalten
      if (focusSheet && orig && orig.field) orig.field.scrollIntoView({ block: 'center' });
      else if (focusSheet && samePage) scrollTo(0, y);
    };
    renderLearn(false);
  }

  // ---------- Prüfungsmodus ----------
  async function examView(sid) {
    setNav('exams');
    let view = await api(`/api/sessions/${sid}`);
    if (view.session.finished) { location.hash = `#/result/${sid}`; return; }
    state.view = view;
    const order = view.session.part_order;
    const stKey = `exam-pos-${sid}`;
    let pos = JSON.parse(sessionStorage.getItem(stKey) || 'null') || { item: null };
    const tools = workTools();

    const currentPartId = () => order.find((pid) => !(view.session.parts.find((s) => s.part_id === pid) || {}).finished_at) || null;

    const startTimer = (partId) => {
      stopTimer();
      const remaining = view.remaining[partId];
      if (remaining === null || remaining === undefined) return;
      const loadedAt = Date.now();
      const box = $('#timerbox');
      box.hidden = false;
      let announced = false;
      const tick = async () => {
        const left = Math.max(0, remaining - Math.floor((Date.now() - loadedAt) / 1000));
        const m = Math.floor(left / 60), s = left % 60;
        box.innerHTML = `<small>Restzeit</small>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        box.className = 'timer' + (left <= 300 ? ' danger' : left <= 900 ? ' warn' : '');
        if (left <= 300 && !announced) { announced = true; toast('Noch 5 Minuten'); }
        if (left <= 0) { stopTimer(); await finishPart(partId, true); }
      };
      tick();
      state.timer = setInterval(tick, 1000);
    };

    const finishPart = async (partId, auto) => {
      if (!auto && !confirm('Diesen Prüfungsteil abgeben? Danach lassen sich die Antworten nicht mehr ändern.')) return;
      try {
        stopTimer();
        // Handschrift vor der Abgabe lesen, solange die Antworten noch geändert werden dürfen
        const pp = view.exam.parts.find((p) => p.id === partId);
        if (pp && Object.values(view.session.answers).some((a) => a && a.marks && (a.marks.strokes || []).length)) {
          if (!auto && !(await puterReady(true).catch(() => false))) toast('Handschrift wird nicht gelesen. Du siehst sie in der Auswertung und bewertest sie dort selbst.');
          await penReadAll(sid, view, pp);
        }
        view = await post(`/api/sessions/${sid}/finish-part`, { part: partId });
        state.view = view;
        pos = { item: null };
        if (auto) toast('Die Zeit ist abgelaufen. Der Teil wurde abgegeben.');
        if (view.session.finished) location.hash = `#/result/${sid}`; else render();
      } catch (e) { toast(e.message, true); }
    };

    const render = (focusSheet) => {
      const partId = currentPartId();
      if (!partId) { location.hash = `#/result/${sid}`; return; }
      const part = view.exam.parts.find((p) => p.id === partId);
      const st = view.session.parts.find((s) => s.part_id === partId);
      const pi = order.indexOf(partId);
      if (!st.started_at) {
        stopTimer();
        app.innerHTML = `<div class="part-start">
          <p class="work-head"><span class="mode" style="font:500 var(--text-sm)/1 var(--font-display);color:var(--color-accent)">Prüfung, Teil ${pi + 1} von ${order.length}</span></p>
          <h1>${esc(part.title)}</h1>
          <dl class="dl">
            <div><dt>Prüfungszeit</dt><dd>${part.duration_min}<small>Minuten</small></dd></div>
            <div><dt>Punkte</dt><dd>${part.max_points}</dd></div>
            <div><dt>${part.kind === 'WiSo' ? 'Aufgaben' : 'Teilaufgaben'}</dt><dd>${part.kind === 'WiSo' ? part.tasks.length : part.tasks.reduce((a, t) => a + t.items.length, 0)}</dd></div>
          </dl>
          <p class="prose">Mit dem Start läuft die Zeit. Antworten werden automatisch gespeichert, und nach Ablauf der Zeit wird der Teil abgegeben. Ein Taschenrechner ist erlaubt.${part.attachments && part.attachments.length ? ' Der Belegsatz steht während der Bearbeitung bereit.' : ''}${pi > 0 ? ' Zwischen den Teilen gibt es in der echten Prüfung eine kurze Pause, nimm sie dir.' : ''}</p>
          <div class="actions" style="margin-top:var(--space-lg)"><button type="button" class="btn primary" id="start-part">Teil ${pi + 1} starten</button>
            ${pdfLink(`/api/exams/${view.exam.id}/pdf?parts=${part.id}`, 'Bogen als PDF zum Ausdrucken')}
            ${(part.attachments || []).map((att, i) => att.pages && att.pages.length ? `<button type="button" class="btn quiet" data-startatt="${i}">${esc(att.title || 'Belegsatz')} ansehen</button>` : '').join('')}</div>
        </div>`;
        $('#start-part').onclick = async () => { $('#start-part').disabled = true; view = await post(`/api/sessions/${sid}/start`, { part: partId }); state.view = view; render(true); };
        $$('[data-startatt]', app).forEach((b) => b.onclick = () => { const att = part.attachments[+b.dataset.startatt]; pageViewer(att.pages, 0, att.title || 'Belegsatz'); });
        return;
      }
      const items = flatItems(part);
      let idx = items.findIndex((x) => x.item.id === pos.item);
      if (idx < 0) idx = 0;
      pos.item = items[idx].item.id;
      sessionStorage.setItem(stKey, JSON.stringify(pos));
      const { task, item } = items[idx];
      const a = getAnswer(view, part.id, item.id);
      const answered = items.filter((x) => !answerIsEmpty(view.session.answers[answerKey(part.id, x.item.id)])).length;
      const where = `${part.kind === 'WiSo' ? 'Aufgabe ' + task.number : task.number + ' ' + (item.label || '')}`;
      const canOrig = !!(origPage(item) && part.page_images && part.page_images[origPage(item) - 1]);
      const onOrig = canOrig && !store.get('ap2.settings', {}).examText;
      app.innerHTML = `<div class="work-head"><div class="where"><span class="mode">Prüfung, Teil ${pi + 1} von ${order.length}</span><h1>${esc(part.title)}</h1></div>
          <div class="actions"><span class="small muted count-wide"><span class="num">${answered} / ${items.length}</span> beantwortet</span>${moreMenu(`<button type="button" class="btn sm quiet" id="b-tools" hidden>Werkzeuge</button>${onOrig ? `<button type="button" class="btn sm quiet" id="b-input" aria-pressed="${penMode()}">Eingabe: ${penMode() ? 'Stift' : 'Tastatur'}</button>` : ''}${canOrig ? `<button type="button" class="btn sm quiet" id="b-view">${onOrig ? 'Als Text ausfüllen' : 'Auf dem Original ausfüllen'}</button>` : ''}`)}<button type="button" class="btn sm danger" id="b-finish">Abgeben</button></div></div>
        <div class="work">${navigatorHtml(view, part.id, item.id, `${esc(where)}, ${idx + 1} von ${items.length}`)}
        <div>${sheetHtml(part, task, item, idx, items.length, `
          <div class="answer${onOrig ? ' mark-host' : ''}" id="answer-area">${onOrig ? '' : renderAnswerInput(item, a, false)}</div>
          <div class="tool-row"><button type="button" id="b-flag" class="btn sm" aria-pressed="${!!a.flagged}">${a.flagged ? 'Zur Kontrolle markiert' : 'Zur Kontrolle markieren'}</button><span class="save-state" id="save-state" role="status"></span></div>`, onOrig ? ' on-orig' : '')}
        <div class="pager"><button type="button" class="btn" id="b-prev" ${idx === 0 ? 'disabled' : ''}>Vorherige</button><span class="pos">${idx + 1} / ${items.length}</span><button type="button" class="btn" id="b-next" ${idx === items.length - 1 ? 'disabled' : ''}>Nächste</button></div>
        </div></div>`;
      if (focusSheet) { $('#task-h').setAttribute('tabindex', '-1'); $('#task-h').focus(); }
      bindNavigator(view, part.id, () => {}, (iid) => { saveNow().then(() => { pos.item = iid; render(true); }); });
      $$('[data-part]', app).forEach((b) => { if (b.dataset.part !== partId) b.disabled = true; });
      startTimer(partId);
      const area = $('#answer-area');
      if (item.answer_type === 'sketch' && $('.ans-pad', area)) drawPad($('.ans-pad', area), getAnswer(view, part.id, item.id).sketch || [], () => area.dispatchEvent(new Event('change')));
      let saveTimer = null;
      const orig = onOrig ? origAnswer(area, part, item, items, (id) => getAnswer(view, part.id, id), () => area.dispatchEvent(new Event('input'))) : null;
      const collect = () => { const prev = getAnswer(view, part.id, item.id); return orig ? orig.collect(prev) : collectAnswer(area, item, prev); };
      const saveNow = async () => {
        const ans = collect();
        const more = orig ? orig.others() : [];
        if (!more.length && JSON.stringify(ans) === JSON.stringify(view.session.answers[answerKey(part.id, item.id)] || null) && answerIsEmpty(ans)) return;
        view.session.answers[answerKey(part.id, item.id)] = ans;
        setSave('speichert …');
        try {
          for (const [iid, oa] of more) { view.session.answers[answerKey(part.id, iid)] = oa; await post(`/api/sessions/${sid}/answer`, { part: part.id, item: iid, answer: oa }); }
          const r = await post(`/api/sessions/${sid}/answer`, { part: part.id, item: item.id, answer: ans });
          setSave('gespeichert');
          if (r.remaining !== null && r.remaining !== undefined) { view.remaining[part.id] = r.remaining; startTimer(partId); }
        } catch (e) { setSave('Nicht gespeichert: ' + e.message); if (/abgelaufen/.test(e.message)) finishPart(partId, true); }
      };
      area.addEventListener('input', () => { clearTimeout(saveTimer); setSave('…'); saveTimer = setTimeout(saveNow, 700); });
      area.addEventListener('change', () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 100); });
      $('#b-flag').onclick = async () => { const ans = collect(); ans.flagged = !ans.flagged; view.session.answers[answerKey(part.id, item.id)] = ans; await post(`/api/sessions/${sid}/answer`, { part: part.id, item: item.id, answer: ans }); render(); };
      $('#b-prev').onclick = async () => { await saveNow(); pos.item = items[idx - 1].item.id; render(true); };
      $('#b-next').onclick = async () => { await saveNow(); pos.item = items[idx + 1].item.id; render(true); };
      $('#b-finish').onclick = async () => { await saveNow(); finishPart(partId, false); };
      $$('[data-fig]', app).forEach((b) => b.onclick = () => pageViewer(part.page_images, +b.dataset.fig, 'Abbildung zur Aufgabe'));
      if ($('#b-view')) $('#b-view').onclick = async () => { await saveNow(); const s = store.get('ap2.settings', {}); s.examText = onOrig; store.set('ap2.settings', s); render(true); };
      if ($('#b-input')) $('#b-input').onclick = () => togglePen(saveNow, () => render(true));
      bindMoreMenu();
      tools.mount(part, item);
      if (focusSheet && orig && orig.field) orig.field.scrollIntoView({ block: 'center' });
    };
    render(false);
  }

  // ---------- Auswertung ----------
  async function resultView(sid) {
    setNav('exams');
    const view = await api(`/api/sessions/${sid}`);
    const s = view.session;
    if (s.mode === 'exam' && !s.finished) {
      if (!confirm('Die Prüfung ist noch nicht abgeschlossen. Jetzt alle Teile abgeben und auswerten?')) { location.hash = `#/exam/${sid}`; return; }
      await post(`/api/sessions/${sid}/finish`, {});
      return resultView(sid);
    }
    const exam = s.mode === 'exam' ? (await api(`/api/sessions/${sid}`)).exam : view.exam;
    let filter = 'all';
    const render = async () => {
      const r = await api(`/api/sessions/${sid}/result`);
      const totalPct = r.total_max ? r.total_points / r.total_max * 100 : 0;
      const unrated = r.parts.reduce((a, p) => a + p.unrated_items, 0);
      const bucket = (ir, item) => !ir.answered ? 'empty' : ir.points === null || ir.points === undefined ? 'open' : ir.points >= item.points ? 'full' : 'lost';
      const counts = { all: 0, lost: 0, open: 0, empty: 0 };
      // Seiten mit Handschrift: für die Anzeige je Teilaufgabe und das PDF der ausgefüllten Seiten
      const inkOf = (pid, it) => { const a = s.answers[answerKey(pid, it.id)]; return a && a.marks && (a.marks.strokes || []).length ? a.marks.strokes : null; };
      const inkMap = new Map();
      r.parts.forEach((p) => { const part = exam.parts.find((x) => x.id === p.part_id); part.tasks.forEach((t) => t.items.forEach((it) => { const st = inkOf(p.part_id, it), src = st && part.page_images && part.page_images[origPage(it) - 1]; if (src) inkMap.set(src, (inkMap.get(src) || []).concat(st)); })); });
      const inkPages = [...inkMap.keys()];
      const inkOpen = r.parts.reduce((n, p) => n + p.items.filter((ir) => ir.ink && (ir.points === null || ir.points === undefined)).length, 0);
      r.parts.forEach((p) => { const part = exam.parts.find((x) => x.id === p.part_id); p.items.forEach((ir) => { const it = part.tasks.find((x) => x.number === ir.task_number).items.find((x) => x.id === ir.item_id); counts.all++; const b = bucket(ir, it); if (b in counts) counts[b]++; }); });
      app.innerHTML = `<div class="page-head"><div>
          <p class="work-head" style="margin:0 0 var(--space-xs)"><span class="mode" style="font:500 var(--text-sm)/1 var(--font-display);color:var(--color-accent)">${s.mode === 'exam' ? 'Auswertung der Prüfungssimulation' : 'Zwischenstand im Lernmodus'}</span></p>
          <h1>${esc(s.exam_title)}</h1></div>
          <div class="actions">${inkPages.length ? '<button type="button" class="btn sm" id="r-inkpdf">Ausgefüllte Seiten als PDF</button>' : ''}${pdfLink(`/api/sessions/${sid}/pdf?solutions=1`, 'PDF mit Antworten und Lösungen')}<a class="btn sm" href="#/exam-detail/${s.exam_id}">Zur Prüfung</a></div></div>
        ${inkOpen ? `<div class="panel warn" role="status"><h4>${inkOpen} ${inkOpen === 1 ? 'handschriftliche Antwort ist' : 'handschriftliche Antworten sind'} noch nicht bewertet</h4><p>Die Handschrift konnte nicht gelesen werden. Deine Antworten sind aber gespeichert: Unter „Noch bewerten“ siehst du sie auf der Originalseite neben den Lösungshinweisen und trägst die Punkte selbst ein.</p></div>` : ''}
        <div class="split">
          <div class="sheet">
            <table class="t"><thead><tr><th>Bereich</th><th class="num">Punkte</th><th class="num">Note</th><th class="num">Zeit</th></tr></thead><tbody>
            ${r.parts.map((p) => `<tr><td>${esc(kindLabel(p.kind))}${p.unrated_items ? `<span class="sub tag accent">${p.unrated_items} Antworten noch selbst bewerten</span>` : ''}</td><td class="num">${fmtPts(Math.round(p.points * 2) / 2)} / ${p.max_points}</td><td class="num">${p.grade}</td><td class="num">${p.used_minutes ? Math.round(p.used_minutes) + ' min' : '–'}</td></tr>`).join('')}
            </tbody></table>
            <p style="margin-top:var(--space-md)"><span class="grade">${fmtPts(Math.round(r.total_points * 2) / 2)}</span> <span class="muted">von ${r.total_max} Punkten, ${totalPct.toFixed(0)} %, Notenschnitt ${r.average_grade.toFixed(1).replace('.', ',')}</span></p>
            ${s.mode === 'exam' ? `<p class="verdict ${r.passed ? 'ok' : 'bad'}" style="margin-top:var(--space-xs)">${unrated ? `Vorläufig, ${unrated} noch nicht bewertet: ` : ''}${r.passed ? 'Bestanden' : 'Nach den Bestehensregeln nicht bestanden'}</p>` : ''}
          </div>
          <div class="small muted prose">
            <p>Notenschlüssel je Bereich: 1 ab 92, 2 ab 81, 3 ab 67, 4 ab 50, 5 ab 30 Punkten, darunter 6.</p>
            <p>Bestanden heißt hier: insgesamt mindestens 50 %, höchstens ein Bereich mangelhaft und keiner ungenügend.</p>
            <p>Alles wird automatisch bewertet: Rechen- und Auswahlaufgaben nach der Lösung, Freitext nach den Stichworten der Lösungshinweise (Anteil der gefundenen Stichworte, auf halbe Punkte gerundet).${s.mode === 'exam' ? '' : ' Im Lernmodus kannst du die Punkte selbst anpassen.'}</p>
          </div>
        </div>
        ${r.topic_stats.length ? `<section class="section"><details class="disc"><summary>Auswertung nach Themen<span class="tag">${r.topic_stats.length} Themen</span></summary><div class="disc-body">${r.topic_stats.map((t) => meterRow(esc(t.topic), t.ratio, `${fmtPts(t.points)} / ${fmtPts(t.max_points)}`)).join('')}</div></details></section>` : ''}
        <section class="section" aria-labelledby="ti-h">
          <h2 id="ti-h">Teilaufgaben</h2>
          <div class="tabs" role="tablist" aria-label="Teilaufgaben filtern">
            <button type="button" role="tab" data-filter="all" aria-selected="${filter === 'all'}">Alle<span class="count">${counts.all}</span></button>
            <button type="button" role="tab" data-filter="lost" aria-selected="${filter === 'lost'}">Punkte verloren<span class="count">${counts.lost}</span></button>
            ${counts.open ? `<button type="button" role="tab" data-filter="open" aria-selected="${filter === 'open'}">Noch bewerten<span class="count">${counts.open}</span></button>` : ''}
            <button type="button" role="tab" data-filter="empty" aria-selected="${filter === 'empty'}">Nicht beantwortet<span class="count">${counts.empty}</span></button>
          </div>
          ${r.parts.map((p) => { const part = exam.parts.find((x) => x.id === p.part_id); return `<h3 style="margin-top:var(--space-lg)" data-parthead>${esc(kindLabel(p.kind))}</h3>
            ${p.items.map((ir) => { const t = part.tasks.find((x) => x.number === ir.task_number); const item = t.items.find((x) => x.id === ir.item_id); const a = s.answers[answerKey(p.part_id, item.id)] || {}; const c = ir.check; const b = bucket(ir, item);
              return `<div class="result-item" id="ri-${p.part_id}-${item.id}" data-bucket="${b}" ${filter !== 'all' && filter !== b ? 'hidden' : ''}>
                <div class="ri-head"><div><strong>${part.kind === 'WiSo' ? `Aufgabe ${t.number}` : `${t.number}${esc(item.label ? ' ' + item.label : '')}`}</strong> <span class="muted small">${esc(t.title || '')}</span></div>
                  ${b === 'open' ? '<span class="score open">noch bewerten</span>' : `<span class="score ${ir.points >= item.points ? 'ok' : ir.points > 0 ? 'part' : 'bad'}">${fmtPts(ir.points)} / ${fmtPts(item.points)}${ir.auto ? ' automatisch' : ir.keyword ? ' nach Stichworten' : ''}</span>`}</div>
                <p class="q">${nl(item.text)}</p>
                ${item.options && item.options.length ? `<div class="small muted">${item.options.map((o) => `<div><span class="key">${esc(o.key)}</span> ${esc(o.text)}</div>`).join('')}</div>` : ''}
                ${ir.ink ? `<div class="ink-view" data-ink="${p.part_id}|${item.id}" aria-label="Deine handschriftliche Antwort auf der Originalseite"></div>` : ''}
                <div class="ans">${answerIsEmpty(a) ? `<em class="muted">${ir.ink ? 'Handschrift nicht gelesen, siehe oben' : 'Keine Antwort'}</em>` : esc([a.value, (a.selected || []).join(', '), a.text, ...(a.cells || []).map((row) => row.filter((cell) => cell && cell.trim()).join(' | '))].filter(Boolean).join('\n'))}</div>
                ${c && c.keywords && c.keywords.length ? `<div class="kws">${c.keywords.map((k) => `<span class="kw ${k.hit ? 'hit' : 'miss'}">${esc(k.keyword)}</span>`).join('')}</div>` : ''}
                ${c && c.message && ir.auto ? `<p class="small">${esc(c.message)}</p>` : ''}
                <details ${ir.auto ? '' : 'open'}><summary>Lösungshinweise${item.expected ? `: ${esc(item.expected)} ${esc(item.unit || '')}` : ''}</summary><div class="panel solution">${nl(item.solution || '–')}${item.grading ? `<p class="grading">Bewertung: ${esc(item.grading)}</p>` : ''}</div></details>
                ${(ir.auto || s.mode === 'exam') && !ir.ink ? '' : critHtml(item, a, `${p.part_id}|${item.id}`, false)}
                ${(ir.auto || s.mode === 'exam') && !ir.ink ? '' : `<div class="selfgrade"><label class="field"><span>Punkte</span><input class="input num" type="number" min="0" max="${item.points}" step="0.5" value="${a.self_points ?? (c && c.suggested_points !== undefined && !answerIsEmpty(a) ? c.suggested_points : '')}" data-sg="${p.part_id}|${item.id}"></label><span class="small muted" style="padding-bottom:var(--space-xs)">von ${fmtPts(item.points)}</span><button type="button" class="btn sm" data-sgfull="${p.part_id}|${item.id}">Volle Punkte</button><button type="button" class="btn sm" data-sgzero="${p.part_id}|${item.id}">0 Punkte</button></div>`}
              </div>`; }).join('')}`; }).join('')}
          <p class="empty" id="ri-none" hidden>Keine Teilaufgabe in dieser Ansicht.</p>
        </section>`;
      const applyFilter = () => {
        $$('[data-filter]', app).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));
        $$('.result-item', app).forEach((el) => { el.hidden = filter !== 'all' && el.dataset.bucket !== filter; });
        $('#ri-none').hidden = $$('.result-item', app).some((el) => !el.hidden);
      };
      $$('[data-filter]', app).forEach((b) => b.onclick = () => { filter = b.dataset.filter; applyFilter(); });
      applyFilter();
      const sg = async (part, itemId, pts, crit) => { await post(`/api/sessions/${sid}/self-grade`, { part, item: itemId, points: pts, criteria: crit }); const y = window.scrollY; await render(); window.scrollTo(0, y); };
      $$('[data-crit]', app).forEach((fs) => fs.onchange = () => { const [part, itemId] = fs.dataset.crit.split('|'); const item = exam.parts.find((x) => x.id === part).tasks.flatMap((t) => t.items).find((x) => x.id === itemId); const r = critPoints(fs, item); sg(part, itemId, r.pts, r.idx); });
      $$('input[data-sg]', app).forEach((i) => i.onchange = () => { const [part, itemId] = i.dataset.sg.split('|'); const max = +i.max; sg(part, itemId, i.value === '' ? null : Math.min(max, Math.max(0, +String(i.value).replace(',', '.')))); });
      $$('[data-sgfull]', app).forEach((b) => b.onclick = () => { const [part, itemId] = b.dataset.sgfull.split('|'); const inp = app.querySelector(`input[data-sg="${part}|${itemId}"]`); sg(part, itemId, +inp.max); });
      $$('[data-sgzero]', app).forEach((b) => b.onclick = () => { const [part, itemId] = b.dataset.sgzero.split('|'); sg(part, itemId, 0); });
      if ($('#r-inkpdf')) $('#r-inkpdf').onclick = () => downloadPages(inkPages, `${s.exam_title} ausgefüllt`, inkPages.map((src) => inkMap.get(src)));
      // Ausschnitt der Originalseite mit der eigenen Handschrift, über die ganze Breite
      for (const el of $$('[data-ink]', app)) {
        const [pid, iid] = el.dataset.ink.split('|'); const part = exam.parts.find((x) => x.id === pid); const it = part.tasks.flatMap((t) => t.items).find((x) => x.id === iid);
        const st = inkOf(pid, it), src = st && part.page_images && part.page_images[origPage(it) - 1];
        if (!src) { el.remove(); continue; }
        const ys = st.flatMap((x) => x.pts.map((q) => q[1])).concat((it.fields || []).flatMap((f) => [f.y, f.y + f.h]));
        const y0 = Math.max(0, Math.min(...ys) - 0.02), y1 = Math.min(1, Math.max(...ys) + 0.02);
        try {
          const img = await loadImg(await window.AP2Local.pageSrc(src)); const W = img.naturalWidth, H = img.naturalHeight;
          const c = document.createElement('canvas'); c.width = W; c.height = Math.max(8, Math.round((y1 - y0) * H));
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, y0 * H, W, c.height, 0, 0, W, c.height); g.drawImage(inkLayer(st, W, H), 0, y0 * H, W, c.height, 0, 0, W, c.height);
          c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Deine handschriftliche Antwort'); el.append(c);
        } catch (e) { el.textContent = 'Seite konnte nicht geladen werden.'; }
      }
    };
    await render();
  }

  // ---------- Archiv: alle Originalprüfungen, nach Beruf ----------
  const BERUF_SLUG = (b) => b.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const docPages = (d) => Array.from({ length: d.pages }, (_, i) => `pages_web/${d.id}/${String(i + 1).padStart(d.pages > 99 ? 3 : 2, '0')}.webp`);
  const bookNote = (d) => {
    if (d.ordnung !== 'AO1997' || !/^GA/.test(d.teil || '')) return '';
    if (d.sort >= '2013') return '';
    return d.sort.startsWith('2003') || d.sort.startsWith('2000') ? 'Fachbuch vermutlich erlaubt' : 'damals mit Fachbuch, ohne Belegsatz';
  };
  async function archiveCatalog() {
    const cat = await api('/api/archive');
    const docs = (cat.docs || []).filter((d) => !d.duplicate_of && d.pages > 0);
    // Stick-Kopie: jede Datei vom Stick mit ihrem Pfad; inhaltsgleiche Scans zeigen das Vertreter-Dokument
    const rep = Object.fromEntries(docs.map((d) => [d.id, d]));
    const stick = (cat.docs || []).flatMap((d) => (d.stick || []).map((path) => ({ path, d: rep[d.duplicate_of || d.id] }))).filter((x) => x.d).sort((a, b) => a.path.localeCompare(b.path, 'de'));
    const sols = {}; docs.filter((d) => (d.rolle === 'loesung' || d.rolle === 'geloest') && d.solution_of).forEach((d) => { (sols[d.solution_of] || (sols[d.solution_of] = [])).push(d); });
    return { docs, sols, stick };
  }
  async function archiveView(slug) {
    setNav('archive');
    const { docs, sols, stick } = await archiveCatalog();
    const counts = {}; docs.forEach((d) => { if (d.rolle !== 'loesung' && d.rolle !== 'geloest') counts[d.beruf] = (counts[d.beruf] || 0) + 1; });
    const main = ['IT-System-Elektroniker', 'Alle IT-Berufe'];
    const others = Object.keys(counts).filter((b) => !main.includes(b)).sort();
    const beruf = [...main, ...others].find((b) => BERUF_SLUG(b) === slug) || 'IT-System-Elektroniker';
    // gemeinsame Teile (WiSo/Teil 3, AP1, alte GA2) gehören zu jeder Berufsprüfung dazu; Lösungen und gelöste Fassungen hängen als Knopf am Aufgabensatz
    const list = docs.filter((d) => (d.beruf === beruf || d.beruf === 'Alle IT-Berufe') && d.teil !== 'Übung' && ((d.rolle !== 'loesung' && d.rolle !== 'geloest') || !d.solution_of));
    const RANK = ['Teil 1', 'Teil 2', 'Teil 3 WiSo', 'AP1', 'GA1', 'GA2', 'WiSo', 'Komplettsatz', 'Belegsatz', 'Formelsammlung', 'Lösungsbogen'];
    const rank = (d) => { const i = RANK.indexOf(d.teil); return i < 0 ? RANK.length : i; };
    // Abschnitt je Dokument: im selben Termin können AP1 (z. B. Baden-Württemberg) und AP2 liegen
    const docGroup = (d) => d.ordnung === 'AO1997' ? 'alt' : d.pruefung === 'AP2' ? 'ap2' : 'ap1';
    const terms = {}; list.forEach((d) => { const k = d.sort + '|' + d.termin + '|' + docGroup(d); (terms[k] || (terms[k] = [])).push(d); });
    // je Teil eine Zeile, der Scan mit Lösung zuerst; weitere Scans desselben Teils kommen ins Menü „Mehr“
    const rowsOf = (ds) => { const g = {}; ds.slice().sort((x, y) => rank(x) - rank(y) || (sols[y.id] ? 1 : 0) - (sols[x.id] ? 1 : 0)).forEach((d) => { const k = d.teil + '|' + d.rolle; (g[k] || (g[k] = [])).push(d); }); return Object.values(g); };
    const docRow = ([d, ...more]) => {
      const so = sols[d.id] || [];
      const m = d.title.match(/^(Teil \d+|AP1|GA\d)[:\s]+(.*)$/);
      // immer vier Plätze (Bearbeiten, Ansehen, Lösungen, Mehr), damit die Knöpfe auf breiten Schirmen in Spalten stehen
      return `<div class="doc-row"><p class="doc-name">${m ? `<strong>${esc(m[1])}</strong> ${esc(m[2])}` : esc(d.title)}${d.rolle === 'loesung' ? ' <span class="tag">Lösung</span>' : ''}${d.note ? ` <span class="tag warn">${esc(d.note)}</span>` : ''}</p><div class="actions">
        ${d.rolle === 'aufgaben' ? `<a class="btn sm" href="#/original/${d.id}">Bearbeiten</a>` : '<span></span>'}
        <button type="button" class="btn sm quiet" data-view="${d.id}">Ansehen</button>
        <span class="doc-sols">${so.map((x) => `<button type="button" class="btn sm quiet" data-view="${x.id}">${x.rolle === 'geloest' ? 'Gelöst' : 'Lösung'}</button>`).join('')}</span>
        ${moreMenu(`<button type="button" class="btn sm quiet" data-print="${d.id}">Drucken</button><button type="button" class="btn sm quiet" data-dl="${d.id}">Herunterladen (PDF)</button>${more.map((x, i) => `<button type="button" class="btn sm quiet" data-view="${x.id}">Weiterer Scan ${i + 2}, ${x.pages} Seiten</button>`).join('')}`)}</div></div>`; };
    // Belegsatz, Lösungsbogen, Deckblatt usw. gesammelt in einer Zeile
    const extraRow = (rows) => { const name = (d) => d.teil === 'Sonstiges' ? d.title.split(' ')[0] : d.teil; return `<div class="doc-row extra"><p class="doc-name muted">Beilagen</p><div class="actions">${rows.map(([d]) => `<button type="button" class="btn sm quiet" data-view="${d.id}">${esc(name(d))}</button>`).join('')}
        ${moreMenu(rows.map(([d]) => `<button type="button" class="btn sm quiet" data-print="${d.id}">${esc(name(d))} drucken</button><button type="button" class="btn sm quiet" data-dl="${d.id}">${esc(name(d))} herunterladen</button>`).join(''))}</div></div>`; };
    const termHtml = (k, open) => {
      const [, termin] = k.split('|'); const rows = rowsOf(terms[k]);
      const main = rows.filter(([d]) => rank(d) < RANK.indexOf('Komplettsatz')); const extra = rows.filter((r) => !main.includes(r));
      const solved = main.filter(([d]) => sols[d.id] || d.rolle === 'loesung').length;
      const solTag = !main.length ? '' : solved === main.length ? '<span class="tag ok">mit Lösungen</span>' : solved ? `<span class="tag">Lösung zu ${solved} von ${main.length} Teilen</span>` : '<span class="tag warn">ohne Lösungen</span>';
      return `<details class="disc" data-term="${esc(`${termin} ${[...new Set(terms[k].map((d) => d.pruefung))].join(' ')}`.toLowerCase())}"${open ? ' open' : ''}><summary>${esc(termin)}<span class="tag">${main.length} ${main.length === 1 ? 'Teil' : 'Teile'}</span>${solTag}</summary><div class="disc-body doc-rows">${main.map(docRow).join('')}${extra.length ? extraRow(extra) : ''}</div></details>`; };
    const groupOf = (k) => k.split('|')[2];
    // Stick-Kopie als eigene Kategorie bei AP2: je Ordner vom Stick ein aufklappbarer Block, Dateien wie dort benannt
    const stickDirs = {}; if (main.includes(beruf)) stick.forEach((x) => { const i = x.path.lastIndexOf('/'); (stickDirs[x.path.slice(0, i)] || (stickDirs[x.path.slice(0, i)] = [])).push(x); });
    const stickName = (x) => x.path.slice(x.path.lastIndexOf('/') + 1).replace(/\.pdf$/i, '').trim();
    const stickRow = (x) => `<div class="doc-row"><p class="doc-name">${esc(stickName(x))}</p><div class="actions">
        ${x.d.rolle === 'aufgaben' ? `<a class="btn sm" href="#/original/${x.d.id}">Bearbeiten</a>` : '<span></span>'}
        <button type="button" class="btn sm quiet" data-view="${x.d.id}">Ansehen</button><span class="doc-sols"></span>
        ${moreMenu(`<button type="button" class="btn sm quiet" data-print="${x.d.id}">Drucken</button><button type="button" class="btn sm quiet" data-dl="${x.d.id}">Herunterladen (PDF)</button>`)}</div></div>`;
    const stickHtml = Object.keys(stickDirs).length ? `<section class="section" data-sec="ap2"><div class="sec-head"><h2>Stick-Kopie vom 12.11.2026 <span class="small muted sec-sub">AP2 und WiSo, wie auf dem Stick abgelegt, ${stick.length} Dateien</span></h2><a class="btn sm quiet" href="stick.html">Originaldateien als ZIP</a></div>
      ${Object.entries(stickDirs).map(([dir, xs]) => `<details class="disc" data-term="${esc(`${dir} ${xs.map(stickName).join(' ')}`.toLowerCase())}"><summary>${esc(dir.split('/').join(' / '))}<span class="tag">${xs.length} ${xs.length === 1 ? 'Datei' : 'Dateien'}</span></summary><div class="disc-body doc-rows">${xs.map(stickRow).join('')}</div></details>`).join('')}</section>` : '';
    const keys = Object.keys(terms).sort().reverse();
    const SECTIONS = [['ap2', 'Abschlussprüfung Teil 2 (AP2)', 'Ordnung 2020'], ['ap1', 'Abschlussprüfung Teil 1 (AP1)', 'Ordnung 2020, für alle IT-Berufe gleich'], ['alt', 'Alte Ordnung', 'GA1, GA2 und WiSo']];
    const bookHtml = list.some((d) => bookNote(d)) ? '<details class="why"><summary>Bis Winter 2012/13 war ein Fachbuch erlaubt</summary><p>In den Ganzheitlichen Aufgaben (GA1 und GA2) der alten Ordnung durften Prüflinge ein Tabellenbuch, ein IT-Handbuch oder eine Formelsammlung mitbringen, einen Belegsatz gab es nicht. Ohne Buch sind diese Sätze deutlich schwerer. In WiSo war nie ein Buch erlaubt.</p></details>' : '';
    const present = SECTIONS.filter(([g]) => keys.some((k) => groupOf(k) === g));
    const SEG = { ap2: 'AP2', ap1: 'AP1', alt: 'Alte Ordnung' };
    const segCount = (g) => keys.filter((k) => g === 'all' || groupOf(k) === g).length;
    app.innerHTML = `<div class="page-head"><div><h1>Archiv</h1><p class="lede">Originalprüfungen zum Durchblättern und Bearbeiten, mit Lösungen, wo vorhanden.</p></div>
        <label class="arch-beruf"><span>Beruf</span><select class="input" id="a-beruf">${[...main, ...others].filter((b) => counts[b]).map((b) => `<option value="${BERUF_SLUG(b)}" ${b === beruf ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label></div>
      <div class="arch-tools">
        ${present.length > 1 ? `<div class="arch-seg" role="group" aria-label="Prüfung">${[['all', 'Alle'], ...present.map(([g]) => [g, SEG[g]])].map(([g, l]) => `<button type="button" class="btn" data-aseg="${g}" aria-pressed="${g === 'all'}">${l}<span class="arch-n">${segCount(g)}</span></button>`).join('')}</div>` : ''}
        <input class="input" type="search" id="a-search" autocomplete="off" aria-label="Termin suchen" placeholder="Termin suchen, z. B. 2024">
      </div>
      ${main.includes(beruf) ? '' : '<p class="note" style="margin-bottom:var(--space-lg)">Prüfungen eines anderen Berufs. Sie helfen beim Lernen gemeinsamer Themen, gehören aber nicht zur Prüfung IT-System-Elektroniker.</p>'}
      <div id="a-list">${SECTIONS.map(([g, h, sub]) => { const ks = keys.filter((k) => groupOf(k) === g); return (ks.length ? `<section class="section" data-sec="${g}"><div class="sec-head"><h2>${h} <span class="small muted sec-sub">${sub}, ${ks.length} Termine</span></h2><button type="button" class="btn sm quiet" data-zip="${g}">Alle herunterladen (ZIP)</button></div>${g === 'alt' ? bookHtml : ''}${ks.map((k, i) => termHtml(k, i === 0 && g === groupOf(keys[0]))).join('')}</section>` : '') + (g === 'ap2' ? stickHtml : ''); }).join('') || '<p class="empty">Für diesen Beruf liegen keine Dokumente vor.</p>'}</div>
      <p class="empty" id="a-none" hidden>Kein Termin passt zum Filter.</p>`;
    bindMoreMenu();
    $('#a-beruf').onchange = (ev) => { location.hash = `#/archive/${ev.target.value}`; };
    const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
    $$('[data-view]', app).forEach((b) => b.onclick = () => { const d = byId[b.dataset.view]; pageViewer(docPages(d), 0, `${d.termin}: ${d.title}`); });
    $$('[data-print]', app).forEach((b) => b.onclick = () => { const d = byId[b.dataset.print]; printPages(docPages(d), `${d.termin}: ${d.title}`); });
    $$('[data-dl]', app).forEach((b) => b.onclick = () => { const d = byId[b.dataset.dl]; downloadPages(docPages(d), `${d.termin} ${d.title}`); });
    // Abschnitt als ZIP: je Termin ein Ordner, darin Original und Lösung
    $$('[data-zip]', app).forEach((b) => b.onclick = () => {
      const list = [];
      keys.filter((k) => groupOf(k) === b.dataset.zip).forEach((k) => {
        const [, termin] = k.split('|'), dir = fileSafe(termin.replace('/', '-'));
        rowsOf(terms[k]).forEach(([d]) => {
          list.push([`${dir}/${d.rolle === 'loesung' ? 'Lösung' : 'Original'}/${fileSafe(d.title)}`, docPages(d)]);
          (sols[d.id] || []).forEach((x) => list.push([`${dir}/Lösung/${fileSafe(x.title)}`, docPages(x)]));
        });
      });
      downloadZip(list, `Archiv ${beruf} ${SEG[b.dataset.zip]}`);
    });
    let seg = 'all';
    const apply = () => {
      const q = $('#a-search').value.toLowerCase().trim();
      $$('[data-term]', app).forEach((c) => { c.hidden = !!q && !c.dataset.term.includes(q); });
      $$('[data-sec]', app).forEach((x) => { x.hidden = (seg !== 'all' && x.dataset.sec !== seg) || !$$('[data-term]', x).some((c) => !c.hidden); });
      $('#a-none').hidden = $$('[data-sec]', app).some((x) => !x.hidden);
    };
    $('#a-search').oninput = apply;
    $$('[data-aseg]', app).forEach((b) => b.onclick = () => {
      seg = b.dataset.aseg;
      $$('[data-aseg]', app).forEach((x) => x.setAttribute('aria-pressed', x === b));
      apply();
    });
  }

  // ---------- Originalprüfung bearbeiten (Seiten, Notizen, Timer, Selbstbewertung) ----------
  async function originalView(id) {
    setNav('archive');
    const { docs, sols } = await archiveCatalog();
    const d = docs.find((x) => x.id === id);
    if (!d) { app.innerHTML = errorState('Dokument nicht gefunden', 'Dieses Dokument ist nicht im Archiv.'); return; }
    const store = window.AP2Local.originals;
    const o = store.get(id) || { id, title: `${d.termin}: ${d.title}`, beruf: d.beruf, created: new Date().toISOString(), notes: '', started: null, minutes: /wiso/i.test(d.teil || '') ? 60 : 90, finished: null, points: null, max: 100 };
    const so = sols[id] || [];
    const pages = docPages(d);
    app.innerHTML = `<div class="work-head"><div class="where"><span class="mode">Original bearbeiten</span><h1>${esc(d.termin)}: ${esc(d.title)}</h1></div>
        <div class="actions"><a class="btn sm quiet" href="#/archive/${BERUF_SLUG(d.beruf)}">Zurück zum Archiv</a></div></div>
      ${bookNote(d) ? `<p class="note warn" style="margin-bottom:var(--space-md)">${bookNote(d)}: Nimm zum Üben ein Tabellenbuch oder eine Formelsammlung dazu.</p>` : ''}
      <div class="work">
        <aside class="navigator" style="display:grid;gap:var(--space-md);align-content:start">
          <div><h2 style="font-size:var(--text-lg)">Zeit</h2>
            <div class="actions" style="margin-top:var(--space-xs)"><label class="field" style="width:6.5rem"><span>Minuten</span><input class="input num" type="number" min="1" max="300" id="o-min" value="${o.minutes}"></label>
            <button type="button" class="btn" id="o-start" style="align-self:end">${o.started ? 'Neu starten' : 'Zeit starten'}</button></div>
            <p class="small muted" id="o-time" style="margin-top:var(--space-xs)" role="timer">${o.started ? '' : 'Ohne Zeitlimit üben oder die Zeit starten.'}</p></div>
          <label class="field"><span>Notizen und Antworten</span><textarea class="input" id="o-notes" style="min-height:14rem" placeholder="Zum Beispiel: 1a) …">${esc(o.notes)}</textarea><span class="small muted" id="o-save" role="status"></span></label>
          <div><h2 style="font-size:var(--text-lg)">Auswertung</h2>
            <div class="actions" style="margin-top:var(--space-xs)">${so.length ? so.map((x, i) => `<button type="button" class="btn sm" data-sol="${x.id}">Lösung${so.length > 1 ? ' ' + (i + 1) : ''} ansehen</button>`).join('') : '<span class="small muted">Zu diesem Dokument liegt keine Lösung vor.</span>'}</div>
            <div class="selfgrade"><label class="field"><span>Erreicht</span><input class="input num" type="number" min="0" step="0.5" id="o-points" value="${o.points ?? ''}"></label><label class="field"><span>von</span><input class="input num" type="number" min="1" step="1" id="o-max" value="${o.max}"></label><button type="button" class="btn sm" id="o-done">Speichern</button></div>
            <p class="small muted" id="o-grade" style="margin-top:var(--space-xs)"></p></div>
        </aside>
        <div id="o-pages" class="o-viewer"></div>
      </div>`;
    const persist = () => { try { store.put(o); $('#o-save').textContent = 'gespeichert'; } catch (e) { toast(e.message, true); } };
    docViewer($('#o-pages'), pages, { inline: true, printTitle: `${d.termin}: ${d.title}` });
    let t = null;
    $('#o-notes').oninput = () => { o.notes = $('#o-notes').value; $('#o-save').textContent = '…'; clearTimeout(t); t = setTimeout(persist, 600); };
    const showGrade = () => { if (o.points === null || o.points === undefined || !o.max) { $('#o-grade').textContent = ''; return; } const pct = o.points / o.max * 100; $('#o-grade').textContent = `${pct.toFixed(0)} %, Note ${gradeFor(pct)}`; };
    showGrade();
    $('#o-done').onclick = () => { const p = $('#o-points').value; o.points = p === '' ? null : Math.max(0, +p.replace(',', '.')); o.max = Math.max(1, +$('#o-max').value || 100); o.finished = new Date().toISOString(); persist(); showGrade(); toast('Ergebnis gespeichert'); };
    $$('[data-sol]', app).forEach((b) => b.onclick = () => { const sd = docs.find((x) => x.id === b.dataset.sol); pageViewer(docPages(sd), 0, `Lösung: ${d.termin}`); });
    const tick = () => {
      if (!o.started) return;
      const left = Math.max(0, Math.round((Date.parse(o.started) + o.minutes * 60000 - Date.now()) / 1000));
      $('#o-time').textContent = left ? `Restzeit ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Die Zeit ist abgelaufen.';
      if (!left) { stopTimer(); }
    };
    $('#o-start').onclick = () => { o.minutes = Math.max(1, +$('#o-min').value || 90); o.started = new Date().toISOString(); persist(); stopTimer(); tick(); state.timer = setInterval(tick, 1000); $('#o-start').textContent = 'Neu starten'; };
    if (o.started) { tick(); state.timer = setInterval(tick, 1000); }
  }

  // ---------- Druckansicht (ersetzt den PDF-Export) ----------
  async function printView(examId, sid, query) {
    setNav('exams');
    const q = new URLSearchParams(query || '');
    let exam, session = null;
    if (sid) { const v = await api(`/api/sessions/${sid}`); session = v.session; exam = (await api(`/api/exams/${session.exam_id}`)); }
    else exam = await api(`/api/exams/${examId}`);
    const parts = (q.get('parts') || '').split(',').filter(Boolean);
    const withSol = q.get('solutions') === '1' && (!session || session.mode === 'learn' || session.finished);
    const chosen = exam.parts.filter((p) => !parts.length || parts.includes(p.id));
    const lines = (n) => `<div class="p-lines" style="--n:${n}"></div>`;
    const answerOf = (pid, iid) => (session && session.answers[`${pid}/${iid}`]) || null;
    const itemHtml = (part, item) => {
      const a = answerOf(part.id, item.id);
      const t = item.answer_type;
      let area = '';
      if (item.options && item.options.length) area += `<ol class="p-opts">${item.options.map((o) => `<li><b>${esc(o.key)}</b> ${nl(o.text)}</li>`).join('')}</ol>`;
      if (item.table) area += `<table class="p-table"><thead><tr>${item.table.columns.map((c) => `<th>${nl(c)}</th>`).join('')}</tr></thead><tbody>${item.table.rows.map((r, ri) => `<tr>${r.map((c, ci) => `<td>${(c || '').trim() ? nl(c) : esc(((a && a.cells && a.cells[ri]) || [])[ci] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      if (a && (a.text || a.value || (a.selected || []).length)) area += `<div class="p-answer">${esc([a.value, (a.selected || []).join(', '), a.text].filter(Boolean).join('\n'))}</div>`;
      else if (part.kind !== 'WiSo' && t !== 'table') area += t === 'sketch' ? '<div class="p-box"></div>' : lines(Math.min(9, Math.max(2, Math.ceil(item.points * (t === 'number' ? 1.1 : 1.3))))) + (t === 'number' ? `<p class="p-result">Ergebnis: ______________ ${esc(item.unit || '')}</p>` : '');
      const sol = withSol ? `<div class="p-sol"><b>Lösung${item.expected ? `: ${esc(item.expected)} ${esc(item.unit || '')}` : ''}</b><br>${nl(item.solution || '')}${item.grading ? `<br><i>Bewertung: ${esc(item.grading)}</i>` : ''}</div>` : '';
      return `<div class="p-item"><div class="p-q"><span class="p-label">${esc(item.label)}</span>${nl(item.text)}</div>${area}${sol}<div class="p-rand">${ptsLabel(item.points)}${a && a.self_points != null ? `<br>erreicht: ${fmtPts(a.self_points)}` : ''}</div></div>`;
    };
    const partHtml = (part) => `<section class="p-part">
      <div class="p-cover"><p>Abschlussprüfung ${esc(exam.season || '')} ${esc(String(exam.year || ''))}${exam.origin === 'generated' ? ' (generierte Übungsprüfung)' : ''}</p>
        <h2>${esc(kindLabel(part.kind))}</h2><p>${esc(part.title)}</p><p>IT-System-Elektroniker/-in</p>
        <table class="p-table"><tbody><tr><td>${part.duration_min} Minuten Prüfungszeit</td><td>${part.max_points} Punkte</td><td>${part.tasks.length} Aufgaben</td></tr><tr><td colspan="3">Name, Vorname: ______________________________ Prüflingsnummer: ____________</td></tr></tbody></table>
        <p class="p-small">Übungsfassung aus dem AP2-Simulator, nur für die persönliche Prüfungsvorbereitung.</p></div>
      ${part.situation ? `<div class="p-situation">${nl(part.situation)}</div>` : ''}
      ${part.tasks.map((t) => `<div class="p-task"><h3>${part.kind === 'WiSo' ? `Aufgabe ${t.number}` : `${t.number}. Aufgabe (${t.points} Punkte)`}</h3>${t.intro && part.kind !== 'WiSo' ? `<p class="p-intro">${nl(t.intro)}</p>` : ''}${t.items.map((i) => itemHtml(part, i)).join('')}</div>`).join('')}
      ${part.kind === 'WiSo' ? `<div class="p-sheet"><h3>Lösungsbogen</h3><table class="p-table"><tbody>${part.tasks.map((t) => { const a = answerOf(part.id, t.items[0].id); return `<tr><td>${t.number}</td><td>${a ? esc(a.value || (a.selected || []).join(', ')) : ''}${withSol ? ` <i>(Lösung: ${esc(t.items[0].expected)})</i>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    </section>`;
    app.innerHTML = `<div class="print-bar"><button type="button" class="btn primary" id="p-print">Drucken oder als PDF speichern</button><a class="btn quiet" href="${sid ? `#/result/${sid}` : `#/exam-detail/${exam.id}`}">Zurück</a><span class="small muted">Im Druckdialog „Als PDF speichern“ wählen, Papierformat A4.</span></div>
      <div class="print-doc">${chosen.map(partHtml).join('')}</div>`;
    $('#p-print').onclick = () => window.print();
  }

  async function boot() {
    let st;
    try { st = await window.AP2Local.init(); }
    catch (e) { app.innerHTML = errorState('Daten nicht verfügbar', e.message); return; }
    if (!st.needsPassword) { route(); return; }
    document.body.classList.add('locked');
    app.innerHTML = `<div class="gate"><h1>AP2-Simulator</h1>
      <p class="lede">Die Prüfungen sind geschützt. Gib das Passwort ein, das du bekommen hast. Es bleibt auf diesem Gerät gespeichert.</p>
      <form id="gate-form" class="sheet" style="margin-top:var(--space-lg)" novalidate>
        <label class="field"><span>Passwort</span><input class="input" type="password" id="gate-pw" name="password" autocomplete="current-password" required autofocus></label>
        <p class="small" id="gate-err" role="alert" style="min-height:1lh;color:var(--color-error);margin-top:var(--space-2xs)"></p>
        <div class="actions" style="margin-top:var(--space-sm)"><button type="submit" class="btn primary" id="gate-go">Öffnen</button></div>
      </form></div>`;
    $('#gate-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const pw = $('#gate-pw').value;
      if (!pw) { $('#gate-err').textContent = 'Bitte das Passwort eingeben.'; $('#gate-pw').setAttribute('aria-invalid', 'true'); $('#gate-pw').focus(); return; }
      $('#gate-go').disabled = true; $('#gate-go').textContent = 'Wird entschlüsselt …'; $('#gate-err').textContent = '';
      try { await window.AP2Local.unlock(pw); document.body.classList.remove('locked'); route(); }
      catch (e) { $('#gate-err').textContent = e.message + '.'; $('#gate-pw').setAttribute('aria-invalid', 'true'); $('#gate-pw').focus(); $('#gate-go').disabled = false; $('#gate-go').textContent = 'Öffnen'; }
    };
  }
  boot();
})();
