/* Download der Stick-Kopie: Passwort, Dateiliste, Fortschritt. Die Dateien sind einzeln verschlüsselt (s/xx/<name>.bin),
 * die Liste steht verschlüsselt in data/stick.bin; der Browser baut daraus die ZIP mit der Ordnerstruktur vom Stick. */
(() => {
  'use strict';
  const L = window.AP2Local, $ = (s) => document.querySelector(s), app = $('#app');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mb = (n) => `${(n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  let busy = false;

  $('#s-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const pw = $('#s-pw').value, go = $('#s-go');
    if (!pw) { $('#s-err').textContent = 'Bitte das Passwort eingeben.'; $('#s-pw').focus(); return; }
    go.disabled = true; go.textContent = 'Wird entschlüsselt …'; $('#s-err').textContent = '';
    try {
      const info = await fetch('data/key.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('Den Download gibt es nur auf der veröffentlichten Seite'); return r.json(); });
      const key = await L.keyFor(pw, info);
      const r = await fetch(`data/stick.bin?v=${info.version || ''}`);
      if (!r.ok) throw new Error('Die Dateiliste fehlt');
      show(key, JSON.parse(new TextDecoder().decode(await L.decrypt(await r.arrayBuffer(), key))));
    } catch (e) { $('#s-err').textContent = e.message + '.'; $('#s-pw').focus(); go.disabled = false; go.textContent = 'Öffnen'; }
  };

  function show(key, man) {
    const files = man.files, total = files.reduce((n, f) => n + f.size, 0);
    // Abschnitt je Hauptordner (Prüfungsvorbereitung eigen), darin je Unterordner ein Block mit kurzem Namen
    const secs = {}; files.forEach((f, i) => {
      const p = f.path.split('/'); p.pop();
      const n = p[1] === 'Prüfungsvorbereitung APT 2' ? 2 : 1, sec = p.slice(0, n).join(' / ') || 'Hauptordner', sub = p.slice(n).join(' / ');
      ((secs[sec] || (secs[sec] = {}))[sub] || (secs[sec][sub] = [])).push(i);
    });
    const name = (i) => files[i].path.slice(files[i].path.lastIndexOf('/') + 1);
    const rows = (ix) => ix.map((i) => `<div class="doc-row"><p class="doc-name">${esc(name(i))}</p><span class="small muted" id="s-f${i}">${mb(files[i].size)}</span></div>`).join('');
    app.innerHTML = `<div class="page-head"><div><h1>Stick Kopie - Schiefer</h1><p class="lede">${files.length} Dateien, ${mb(total)}</p></div></div>
      <div class="sheet" style="margin-bottom:var(--space-lg)">
        <div class="actions"><button type="button" class="btn primary" id="s-dl">ZIP herunterladen</button></div>
        <div class="check-head"><span class="check-count" id="s-count" aria-live="polite">Noch nicht gestartet</span><span class="meter"><span id="s-bar" style="width:0"></span></span></div>
        <p class="small muted" id="s-now"></p>
      </div>
      ${Object.entries(secs).sort(([a], [b]) => (a === 'Hauptordner') - (b === 'Hauptordner')).map(([sec, subs]) => { const n = Object.values(subs).flat().length; return `<section class="section"><h2>${esc(sec)} <span class="small muted sec-sub">${n} ${n === 1 ? 'Datei' : 'Dateien'}</span></h2>
        ${Object.entries(subs).map(([sub, ix]) => sub ? `<details class="disc"><summary>${esc(sub)}<span class="tag">${ix.length} ${ix.length === 1 ? 'Datei' : 'Dateien'}</span></summary><div class="disc-body doc-rows">${rows(ix)}</div></details>` : `<div class="doc-rows">${rows(ix)}</div>`).join('')}</section>`; }).join('')}`;
    $('#s-dl').onclick = () => download(key, man, total);
  }

  async function download(key, man, total) {
    if (busy) return;
    busy = true; $('#s-dl').disabled = true;
    const out = []; let bytes = 0;
    try {
      for (const [i, f] of man.files.entries()) {
        $('#s-now').textContent = `Lädt: ${f.path.slice(f.path.lastIndexOf('/') + 1)}`;
        const r = await fetch(`s/${f.f.slice(0, 2)}/${f.f}.bin`);
        if (!r.ok) throw new Error(`${f.path} konnte nicht geladen werden`);
        const data = new Uint8Array(await L.decrypt(await r.arrayBuffer(), key));
        if (data.length !== f.size) throw new Error(`${f.path} ist unvollständig`);
        out.push({ path: `${man.root}/${f.path}`, crc: L.crc32(data), size: data.length, blob: new Blob([data]), date: f.mtime ? new Date(f.mtime * 1000) : undefined });
        bytes += f.size;
        const el = $(`#s-f${i}`); el.textContent = 'geladen'; el.classList.remove('muted');
        $('#s-count').textContent = `${i + 1} von ${man.files.length} Dateien, ${mb(bytes)} von ${mb(total)}`;
        $('#s-bar').style.width = `${Math.round(100 * bytes / total)}%`;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(L.zipBlob(out)); a.download = `${man.root}.zip`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      $('#s-now').textContent = '';
      $('#s-count').textContent = `Fertig: ${out.length} Dateien in ${man.root}.zip`; $('#s-count').parentElement.classList.add('done');
    } catch (e) { $('#s-now').textContent = `Abgebrochen: ${e.message}. Erneut versuchen startet von vorn.`; }
    busy = false; $('#s-dl').disabled = false;
  }
})();
