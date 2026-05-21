// ============================================================
// ΚΥΡΙΑ ΛΟΓΙΚΗ ΕΦΑΡΜΟΓΗΣ — v1.1
// ============================================================

const UNITS = ['κιβ', 'κιλά', 'τεμ'];
const ULABELS = { 'κιβ': 'Κιβ', 'κιλά': 'Κιλά', 'τεμ': 'Σακ/Τεμ' };
const STY_ON  = 'padding:4px 9px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:#1D9E75;color:#fff;transition:all 0.15s';
const STY_OFF = 'padding:4px 9px;font-size:11px;font-weight:500;border:none;cursor:pointer;background:transparent;color:var(--color-text-secondary);transition:all 0.15s';

let cur = null;
let orderState = {};
let quarantine = [];
let catalogSelected = new Set();
let npUnit = 'τεμ';
let micOn = false, recog = null;
let currentScreen = 's-clients';

// ============================================================
// ΑΠΟΘΗΚΕΥΣΗ ΤΡΕΧΟΥΣΑΣ ΚΑΤΑΣΤΑΣΗΣ (session)
// ============================================================

function saveSession() {
  try {
    const session = {
      screen: currentScreen,
      clientId: cur ? cur.id : null,
      orderState: orderState,
      quarantine: quarantine,
    };
    localStorage.setItem('orderapp_session', JSON.stringify(session));
  } catch(e) {}
}

function restoreSession() {
  try {
    const raw = localStorage.getItem('orderapp_session');
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session.clientId) return false;
    const client = window.CLIENTS.find(c => c.id === session.clientId);
    if (!client) return false;
    cur = client;
    orderState = session.orderState || {};
    quarantine = session.quarantine || [];
    // Ενημέρωση header
    document.getElementById('ord-cname').textContent = cur.name;
    document.getElementById('ord-csub').innerHTML =
      `<i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${cur.shop}
       &nbsp;·&nbsp; <span class="rb rb-${cur.route}">${cur.routeLabel}</span>`;
    document.getElementById('sum-cname').textContent = cur.name;
    document.getElementById('sum-csub').textContent = `${cur.shop} — ${cur.routeLabel}`;
    renderOrder();
    // Επιστροφή στην οθόνη παραγγελίας (όχι summary — μπορεί να μην έχει νόημα)
    const targetScreen = session.screen === 's-summary' ? 's-order' : (session.screen || 's-order');
    show(targetScreen, false);
    return true;
  } catch(e) { return false; }
}

// ============================================================
// ΠΛΟΗΓΗΣΗ
// ============================================================

function show(id, doSave = true) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  currentScreen = id;
  if (doSave) saveSession();
}

function openNewProd() {
  document.getElementById('np-search').value = '';
  document.getElementById('live-results').style.display = 'none';
  document.getElementById('np-cat').value = '';
  document.getElementById('np-name').value = '';
  document.getElementById('np-slang').value = '';
  document.getElementById('np-qty').value = '1';
  npUnit = 'τεμ';
  syncNpUnitBtns();
  checkQReady();
  show('s-newprod');
}

function syncNpUnitBtns() {
  document.getElementById('np-unit-seg').querySelectorAll('button').forEach((b, i) => {
    const u = UNITS[i];
    b.style.cssText = u === npUnit
      ? 'flex:1;padding:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:#1D9E75;color:#fff'
      : 'flex:1;padding:8px;font-size:12px;font-weight:500;border:none;cursor:pointer;background:var(--color-background-primary);color:var(--color-text-secondary)';
  });
}

function checkQReady() {
  const name = document.getElementById('np-name').value.trim();
  const cat  = document.getElementById('np-cat').value;
  const btn  = document.getElementById('btn-q');
  if (name && cat) {
    btn.style.cssText = 'flex:1;padding:11px;border-radius:var(--border-radius-md);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#1D9E75;color:#fff';
  } else {
    btn.style.cssText = 'flex:1;padding:11px;border-radius:var(--border-radius-md);font-size:14px;font-weight:500;cursor:not-allowed;border:none;background:var(--color-background-secondary);color:var(--color-text-tertiary)';
  }
}

// ============================================================
// ΛΙΣΤΑ ΠΕΛΑΤΩΝ
// ============================================================

function filterClients(q) {
  const f = q.toLowerCase();
  const filtered = window.CLIENTS.filter(c =>
    c.name.toLowerCase().includes(f) ||
    c.shop.toLowerCase().includes(f) ||
    c.city.toLowerCase().includes(f)
  );
  const byRoute = {};
  filtered.forEach(c => {
    if (!byRoute[c.route]) byRoute[c.route] = [];
    byRoute[c.route].push(c);
  });
  let html = '';
  ROUTES.forEach(r => {
    if (!byRoute[r.key] || !byRoute[r.key].length) return;
    html += `<div class="route-title route-${r.cls}"><i class="ti ti-route" aria-hidden="true"></i> ${r.label}</div>`;
    byRoute[r.key].forEach(c => {
      const initials = c.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      html += `<div class="client-card" onclick="selectClient('${c.id}')">
        <div class="avatar av-${r.cls}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="client-name">${c.name}</div>
          <div class="client-meta">
            <i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${c.shop}
            &nbsp;·&nbsp;
            <i class="ti ti-map-pin" style="font-size:11px" aria-hidden="true"></i> ${c.city}
          </div>
        </div>
        <i class="ti ti-chevron-right" style="color:var(--color-text-tertiary)" aria-hidden="true"></i>
      </div>`;
    });
  });
  document.getElementById('client-list').innerHTML = html ||
    '<div style="color:var(--color-text-tertiary);font-size:13px;padding:1rem 0;text-align:center">Δεν βρέθηκαν πελάτες</div>';
}

// ============================================================
// ΕΠΙΛΟΓΗ ΠΕΛΑΤΗ
// ============================================================

function selectClient(id) {
  cur = window.CLIENTS.find(c => c.id === id);
  if (!cur) return;
  document.getElementById('ord-cname').textContent = cur.name;
  document.getElementById('ord-csub').innerHTML =
    `<i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${cur.shop}
     &nbsp;·&nbsp; <span class="rb rb-${cur.route}">${cur.routeLabel}</span>`;
  document.getElementById('sum-cname').textContent = cur.name;
  document.getElementById('sum-csub').textContent = `${cur.shop} — ${cur.routeLabel}`;
  orderState = {};
  quarantine = [];
  Object.entries(cur.history || {}).forEach(([cat, items]) => {
    Object.entries(items).forEach(([pid, qty]) => {
      const p = getProd(pid);
      if (p) orderState[pid] = { on: true, qty, unit: p.unit };
    });
  });
  renderOrder();
  show('s-order');
}

// ============================================================
// RENDER ΠΑΡΑΓΓΕΛΙΑΣ
// ============================================================

function unitSegHTML(pid, au) {
  return UNITS.map(u =>
    `<button style="${au === u ? STY_ON : STY_OFF}" id="ubtn-${pid}-${u}"
      onclick="setUnit('${pid}','${u}');event.stopPropagation()">${ULABELS[u]}</button>`
  ).join('');
}

function renderOrder() {
  const h = cur.history || {};
  let zHTML = { kty: '', syn: '', apo: '' };

  Object.entries(window.PRODUCTS).forEach(([cat, prods]) => {
    const allHistIds = Object.values(h).flatMap(o => Object.keys(o));
    const showP = prods.filter(p =>
      (h[cat] || {})[p.id] ||
      (orderState[p.id] && orderState[p.id].on && !allHistIds.includes(p.id))
    );
    if (!showP.length) return;
    const zk = getZone(cat);
    zHTML[zk] += `<div class="cat-title">${cat}</div>`;
    showP.forEach(p => {
      const inH = !!(h[cat] || {})[p.id];
      const st = orderState[p.id] || { on: false, qty: (h[cat] || {})[p.id] || 1, unit: p.unit };
      const on = st.on;
      zHTML[zk] += `
        <div class="prow${on ? ' ordered' : ' deselected'}" id="row-${p.id}">
          <button class="check-btn${on ? ' on' : ''}" onclick="toggleP('${p.id}')" aria-label="${on ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}">
            <i class="ti ${on ? 'ti-check' : 'ti-x'}" aria-hidden="true"></i>
          </button>
          <div style="flex:1;min-width:0">
            <div class="pname">${p.name}
              ${p.supplier && p.supplier !== '—' ? `<span class="sup-badge">${p.supplier}</span>` : ''}
              <span class="badge ${inH ? 'b-hist' : 'b-new'}">${inH ? 'ιστορικό' : 'νέο'}</span>
            </div>
            <div class="unit-seg" id="useg-${p.id}">${unitSegHTML(p.id, st.unit)}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qbtn" onclick="chQty('${p.id}',-1)" ${!on ? 'disabled' : ''} id="qm-${p.id}">−</button>
            <span class="qdisplay" id="qty-${p.id}">${st.qty}</span>
            <button class="qbtn" onclick="chQty('${p.id}',1)" ${!on ? 'disabled' : ''} id="qp-${p.id}">+</button>
          </div>
        </div>`;
    });
  });

  let html = '';
  Object.entries(ZONES).forEach(([zk, z]) => {
    if (!zHTML[zk]) return;
    html += `<div class="zone-block">
      <div class="zone-hdr ${z.cls}">
        <i class="ti ${z.icon}" style="font-size:13px" aria-hidden="true"></i>
        <span class="zone-label ${z.cls}">${z.label}</span>
      </div>
      <div class="zone-body">${zHTML[zk]}</div>
    </div>`;
  });
  document.getElementById('order-products').innerHTML = html;
  renderQuarantine();
  saveSession();
}

function setUnit(pid, unit) {
  if (!orderState[pid]) {
    const p = getProd(pid);
    orderState[pid] = { on: true, qty: 1, unit: p.unit };
  }
  orderState[pid].unit = unit;
  orderState[pid].on = true;
  UNITS.forEach(u => {
    const b = document.getElementById(`ubtn-${pid}-${u}`);
    if (b) b.style.cssText = u === unit ? STY_ON : STY_OFF;
  });
  const row = document.getElementById('row-' + pid);
  if (row) row.className = 'prow ordered';
  const cb = row && row.querySelector('.check-btn');
  if (cb) { cb.className = 'check-btn on'; cb.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>'; }
  const qm = document.getElementById('qm-' + pid);
  const qp = document.getElementById('qp-' + pid);
  if (qm) qm.disabled = false;
  if (qp) qp.disabled = false;
  saveSession();
}

function toggleP(pid) {
  const p = getProd(pid);
  const h = cur.history || {};
  const cat = getCatOfProd(pid);
  if (!orderState[pid]) orderState[pid] = { on: false, qty: (h[cat] || {})[pid] || 1, unit: p.unit };
  orderState[pid].on = !orderState[pid].on;
  const on = orderState[pid].on;
  const row = document.getElementById('row-' + pid);
  if (row) row.className = `prow ${on ? 'ordered' : 'deselected'}`;
  const cb = row && row.querySelector('.check-btn');
  if (cb) {
    cb.className = `check-btn${on ? ' on' : ''}`;
    cb.innerHTML = `<i class="ti ${on ? 'ti-check' : 'ti-x'}" aria-hidden="true"></i>`;
  }
  const qm = document.getElementById('qm-' + pid);
  const qp = document.getElementById('qp-' + pid);
  if (qm) qm.disabled = !on;
  if (qp) qp.disabled = !on;
  saveSession();
}

function chQty(pid, d) {
  if (!orderState[pid]) return;
  orderState[pid].qty = Math.max(1, orderState[pid].qty + d);
  const el = document.getElementById('qty-' + pid);
  if (el) el.textContent = orderState[pid].qty;
  saveSession();
}
function chQQty(i, d) {
  quarantine[i].qty = Math.max(1, quarantine[i].qty + d);
  renderQuarantine();
  saveSession();
}

function renderQuarantine() {
  if (!quarantine.length) { document.getElementById('quarantine-section').innerHTML = ''; return; }
  let html = `<div class="zone-block" style="border-color:#EF9F27">
    <div class="zone-hdr" style="background:#FAEEDA;border-bottom:0.5px solid #FAC775">
      <i class="ti ti-clock" style="font-size:13px;color:#633806" aria-hidden="true"></i>
      <span class="zone-label" style="color:#633806">Καραντίνα — αναμένει επιβεβαίωση</span>
    </div><div class="zone-body">`;
  quarantine.forEach((p, i) => {
    html += `<div class="prow ordered" style="border-color:#EF9F27">
      <div style="flex:1;min-width:0">
        <div class="pname">${p.name} <span class="badge b-new">νέο</span></div>
        <div class="pslang">${p.cat}</div>
      </div>
      <div class="qty-ctrl">
        <button class="qbtn" onclick="chQQty(${i},-1)">−</button>
        <span class="qdisplay">${p.qty} ${p.unit}</span>
        <button class="qbtn" onclick="chQQty(${i},1)">+</button>
      </div>
    </div>`;
  });
  html += '</div></div>';
  document.getElementById('quarantine-section').innerHTML = html;
}

// ============================================================
// LIVE ΑΝΑΖΗΤΗΣΗ
// ============================================================

function liveSearch(q) {
  const box = document.getElementById('live-results');
  const f = q.toLowerCase().trim();
  if (!f || f.length < 2) { box.style.display = 'none'; return; }
  const hits = searchProducts(f);
  if (!hits.length) {
    box.innerHTML = '<div class="live-no-results"><i class="ti ti-info-circle" aria-hidden="true"></i> Δεν βρέθηκε — συμπλήρωσε παρακάτω για καραντίνα</div>';
    box.style.display = 'block'; return;
  }
  const allHistIds = new Set(Object.values(cur && cur.history || {}).flatMap(o => Object.keys(o)));
  box.innerHTML = hits.slice(0, 12).map(p => {
    const already = allHistIds.has(p.id);
    const cat = getCatOfProd(p.id);
    const z = ZONES[getZone(cat)];
    return `<div class="live-result-item${already ? ' already' : ''}" onclick="quickAdd('${p.id}')">
      <i class="ti ${z.icon}" style="font-size:13px;color:var(--color-text-tertiary)" aria-hidden="true"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--color-text-primary)">${p.name}
          ${already ? '<span class="badge b-hist">ιστορικό</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--color-text-tertiary)">${cat} · ${p.supplier || ''}</div>
      </div>
      <span style="font-size:11px;color:#1D9E75;font-weight:600">${already ? 'Ενεργοποίηση' : '+ Προσθήκη'}</span>
    </div>`;
  }).join('');
  box.style.display = 'block';
}

function quickAdd(pid) {
  const p = getProd(pid);
  if (!p) return;
  if (!orderState[pid]) orderState[pid] = { on: true, qty: 1, unit: p.unit };
  else orderState[pid].on = true;
  renderOrder();
  show('s-order');
}

// ============================================================
// ΚΑΤΑΛΟΓΟΣ
// ============================================================

function filterCatalog(q) { renderCatalog(q.toLowerCase().trim()); }

function renderCatalog(filter = '') {
  let html = '';
  Object.entries(window.PRODUCTS).forEach(([cat, prods]) => {
    if (!prods.length) return;
    const filtered = filter
      ? prods.filter(p =>
          p.name.toLowerCase().includes(filter) ||
          p.slang.toLowerCase().includes(filter) ||
          (p.supplier || '').toLowerCase().includes(filter))
      : prods;
    if (!filtered.length) return;
    const zk = getZone(cat);
    const z = ZONES[zk];
    const inHist = new Set(Object.keys((cur && cur.history && cur.history[cat]) || {}));
    // FIX: μοναδικό ID χωρίς σύγκρουση
    const accId = 'acc-' + cat.split('').map(c => c.charCodeAt(0)).join('_');
    html += `<div class="cat-acc-hdr" onclick="toggleAcc('${accId}')">
      <span style="font-size:11px;font-weight:500;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.6px">
        <i class="ti ${z.icon}" style="font-size:11px" aria-hidden="true"></i> ${cat}
      </span>
      <span style="font-size:11px;color:var(--color-text-tertiary)">${filtered.length} <i class="ti ti-chevron-down" aria-hidden="true"></i></span>
    </div>
    <div class="cat-acc-body${filter ? ' open' : ''}" id="${accId}">`;
    filtered.forEach(p => {
      const sel = catalogSelected.has(p.id);
      html += `<div class="catalog-prow${sel ? ' selected' : ''}" onclick="toggleCatSel('${p.id}')">
        <i class="ti ${sel ? 'ti-check' : 'ti-circle'}" style="font-size:15px;color:${sel ? '#1D9E75' : 'var(--color-text-tertiary)'}" aria-hidden="true"></i>
        <div style="flex:1;min-width:0">
          <div class="pname">${p.name}${inHist.has(p.id) ? ' <span class="badge b-hist">ιστορικό</span>' : ''}</div>
          <div class="pslang">${p.supplier || ''}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  document.getElementById('catalog-list').innerHTML = html ||
    '<div style="color:var(--color-text-tertiary);font-size:13px;padding:1rem 0">Δεν βρέθηκαν αποτελέσματα</div>';
  updateSelBtn();
}

function toggleAcc(id) { const el = document.getElementById(id); if (el) el.classList.toggle('open'); }
function toggleCatSel(pid) {
  if (catalogSelected.has(pid)) catalogSelected.delete(pid);
  else catalogSelected.add(pid);
  renderCatalog(document.getElementById('cat-search').value.toLowerCase().trim());
}
function updateSelBtn() {
  const n = catalogSelected.size;
  document.getElementById('add-sel-btn').style.display = n > 0 ? 'block' : 'none';
  document.getElementById('sel-count').textContent = n;
}
function addFromCatalog() {
  catalogSelected.forEach(pid => {
    const p = getProd(pid);
    if (!p) return;
    if (!orderState[pid]) orderState[pid] = { on: true, qty: 1, unit: p.unit };
    else orderState[pid].on = true;
  });
  catalogSelected.clear();
  renderOrder();
  show('s-order');
}

// ============================================================
// ΚΑΡΑΝΤΙΝΑ - ΝΕΟ ΠΡΟΪΟΝ
// ============================================================

function setNpUnit(u, idx) {
  npUnit = u;
  syncNpUnitBtns();
}

function addNewProd() {
  const cat  = document.getElementById('np-cat').value;
  const name = document.getElementById('np-name').value.trim();
  if (!cat || !name) return;
  const qty  = parseInt(document.getElementById('np-qty').value) || 1;
  quarantine.push({ name, cat, qty, unit: npUnit });
  document.getElementById('np-cat').value = '';
  document.getElementById('np-name').value = '';
  document.getElementById('np-slang').value = '';
  document.getElementById('np-qty').value = '1';
  document.getElementById('np-search').value = '';
  document.getElementById('live-results').style.display = 'none';
  renderOrder();
  show('s-order');
  showToast('Προστέθηκε στην καραντίνα!');
}

// ============================================================
// ΣΥΝΟΛΑ ΑΝΑ ΚΑΤΗΓΟΡΙΑ & ΖΩΝΗ
// ============================================================

function calcCatTotals(items) {
  // Αθροίζει ποσότητες ανά μονάδα: { κιβ: 5, τεμ: 2 }
  const totals = {};
  items.forEach(({ st }) => {
    if (!totals[st.unit]) totals[st.unit] = 0;
    totals[st.unit] += st.qty;
  });
  return Object.entries(totals).map(([u, q]) => `${q} ${u}`).join(' + ');
}

// ============================================================
// ΕΠΙΒΕΒΑΙΩΣΗ & ΑΠΟΣΤΟΛΗ
// ============================================================

function buildOrderByZone() {
  const ordered = Object.entries(orderState).filter(([, s]) => s.on);
  const byZC = {};
  ordered.forEach(([pid, st]) => {
    const cat = getCatOfProd(pid);
    const p = getProd(pid);
    if (!p) return;
    const zk = getZone(cat);
    if (!byZC[zk]) byZC[zk] = {};
    if (!byZC[zk][cat]) byZC[zk][cat] = [];
    byZC[zk][cat].push({ p, st });
  });
  return byZC;
}

function goSummary() {
  const ordered = Object.entries(orderState).filter(([, s]) => s.on);
  if (!ordered.length && !quarantine.length) {
    showToast('Δεν έχεις επιλέξει κανένα προϊόν!', 'error'); return;
  }
  document.getElementById('sum-date').textContent =
    new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const byZC = buildOrderByZone();

  let html = '';
  Object.entries(ZONES).forEach(([zk, z]) => {
    if (!byZC[zk]) return;
    html += `<div class="sum-zone"><div class="sum-zone-hdr ${z.cls}"><i class="ti ${z.icon}" aria-hidden="true"></i> ${z.label}</div><div class="sum-body">`;
    Object.entries(byZC[zk]).forEach(([cat, items]) => {
      const total = calcCatTotals(items);
      // Επικεφαλίδα κατηγορίας με σύνολο — ΤΣΕΚΑΡΕ ΕΔΩΣΕ πριν φύγεις από αυτή τη ζώνη
      html += `<div class="sum-cat-header">
        <span class="sum-cat-name">${cat}</span>
        <span class="sum-cat-total">${total}</span>
      </div>`;
      items.forEach(({ p, st }) => {
        html += `<div class="sum-line"><span>${p.name}</span><span>${st.qty} ${st.unit}</span></div>`;
      });
    });
    html += '</div></div>';
  });

  if (quarantine.length) {
    html += `<div class="sum-zone" style="border-color:#EF9F27"><div class="sum-zone-hdr qua"><i class="ti ti-clock" aria-hidden="true"></i> Καραντίνα</div><div class="sum-body">`;
    quarantine.forEach(p => {
      html += `<div class="sum-line"><span>${p.name} (${p.cat})</span><span>${p.qty} ${p.unit}</span></div>`;
    });
    html += '</div></div>';
  }

  document.getElementById('sum-content').innerHTML = html;
  show('s-summary');
}

function copyOrder() {
  const byZC = buildOrderByZone();
  let txt = `ΠΑΡΑΓΓΕΛΙΑ: ${cur.name} — ${cur.shop}\nΠΕΡΙΟΧΗ: ${cur.routeLabel}\nΗΜΕΡΟΜΗΝΙΑ: ${new Date().toLocaleDateString('el-GR')}\n\n`;

  Object.entries(ZONES).forEach(([zk, z]) => {
    if (!byZC[zk]) return;
    txt += `=== ${z.label} ===\n`;
    Object.entries(byZC[zk]).forEach(([cat, items]) => {
      const total = calcCatTotals(items);
      txt += `[${cat} — ΣΥΝΟΛΟ: ${total}]\n`;
      items.forEach(({ p, st }) => { txt += `  • ${p.name}: ${st.qty} ${st.unit}\n`; });
    });
    txt += '\n';
  });

  if (quarantine.length) {
    txt += '=== ΚΑΡΑΝΤΙΝΑ (αναμένει επιβεβαίωση) ===\n';
    quarantine.forEach(p => { txt += `• ${p.name}: ${p.qty} ${p.unit}\n`; });
  }

  navigator.clipboard.writeText(txt)
    .then(() => showToast('Αντιγράφηκε!'))
    .catch(() => showToast('Σφάλμα αντιγραφής', 'error'));
}

// ============================================================
// ΜΙΚΡΟΦΩΝΟ
// ============================================================

function toggleMic() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Δοκίμασε από Chrome!', 'error'); return;
  }
  if (micOn) {
    recog && recog.stop();
    micOn = false;
    document.getElementById('mic-btn').classList.remove('listening');
    document.getElementById('voice-hint').style.display = 'none';
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recog = new SR();
  recog.lang = 'el-GR';
  recog.continuous = false;
  recog.interimResults = false;
  recog.onresult = e => {
    const t = e.results[0][0].transcript.toLowerCase();
    document.getElementById('voice-hint').textContent = `"${t}"`;
    parseVoice(t);
    micOn = false;
    document.getElementById('mic-btn').classList.remove('listening');
    setTimeout(() => { document.getElementById('voice-hint').style.display = 'none'; }, 3000);
  };
  recog.onerror = () => {
    micOn = false;
    document.getElementById('mic-btn').classList.remove('listening');
    document.getElementById('voice-hint').style.display = 'none';
  };
  recog.start();
  micOn = true;
  document.getElementById('mic-btn').classList.add('listening');
  document.getElementById('voice-hint').style.display = 'block';
  document.getElementById('voice-hint').textContent = 'Μιλάς...';
}

const NUMS = {
  'ενα':1,'μια':1,'δυο':2,'δύο':2,'τρια':3,'τρία':3,'τεσσερα':4,'τέσσερα':4,
  'πεντε':5,'πέντε':5,'εξι':6,'έξι':6,'επτα':7,'εφτα':7,'οκτω':8,'οχτω':8,
  'εννεα':9,'εννια':9,'δεκα':10,'δέκα':10
};

function parseVoice(text) {
  const hits = searchProducts(text);
  if (!hits.length) return;
  const matched = hits[0];
  let qty = 1;
  text.split(' ').forEach(w => { if (NUMS[w]) qty = NUMS[w]; });
  const m = text.match(/\d+/);
  if (m) qty = parseInt(m[0]);
  if (!orderState[matched.id]) orderState[matched.id] = { on: false, qty: 1, unit: matched.unit };
  orderState[matched.id].on = true;
  orderState[matched.id].qty = qty;
  renderOrder();
  showToast(`"${matched.name}" x${qty}`);
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  filterClients('');
  renderCatalog('');
  document.getElementById('restore-input').addEventListener('change', e => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });
  // Επαναφορά session αν υπάρχει
  restoreSession();
});
