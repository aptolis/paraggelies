// ============================================================
// ΚΥΡΙΑ ΛΟΓΙΚΗ ΕΦΑΡΜΟΓΗΣ — v1.2
// ============================================================

const UNITS = ['κιβ', 'κιλά', 'τεμ'];
const ULABELS = { 'κιβ': 'Κιβ', 'κιλά': 'Κιλά', 'τεμ': 'Σακ/Τεμ' };
const STY_ON  = 'padding:4px 9px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:#1D9E75;color:#fff;transition:all 0.15s';
const STY_OFF = 'padding:4px 9px;font-size:11px;font-weight:500;border:none;cursor:pointer;background:transparent;color:var(--color-text-secondary);transition:all 0.15s';

// Χρώματα ζώνης για αντσεκάριστες γραμμές
const ZONE_ROW_COLORS = {
  kty: { bg: '#EFF6FD', border: '#B5D4F4' },
  syn: { bg: '#F0FAF5', border: '#9FE1CB' },
  apo: { bg: '#F7F6F2', border: '#D3D1C7' },
};

let cur = null;
let orderState = {};    // { pid: { on, qty, unit } }
let quarantine = [];
let catalogSelected = new Set();
let npUnit = 'τεμ';
let micOn = false, recog = null;
let currentScreen = 's-clients';

// Εκκρεμείς παραγγελίες ανά πελάτη: { clientId: { orderState, quarantine } }
let pendingOrders = {};

// ============================================================
// ΑΠΟΘΗΚΕΥΣΗ SESSION
// ============================================================

function saveSession() {
  try {
    if (cur) {
      const hasItems = Object.values(orderState).some(s => s.on) || quarantine.length > 0;
      const notes = document.getElementById('order-notes') ? document.getElementById('order-notes').value : '';
      if (hasItems || notes) {
        pendingOrders[cur.id] = { orderState: JSON.parse(JSON.stringify(orderState)), quarantine: JSON.parse(JSON.stringify(quarantine)), notes };
      } else {
        delete pendingOrders[cur.id];
      }
    }
    const session = {
      screen: currentScreen,
      clientId: cur ? cur.id : null,
      orderState,
      quarantine,
      pendingOrders,
      notes: document.getElementById('order-notes') ? document.getElementById('order-notes').value : '',
    };
    localStorage.setItem('orderapp_session', JSON.stringify(session));
  } catch(e) {}
}

function restoreSession() {
  try {
    const raw = localStorage.getItem('orderapp_session');
    if (!raw) return false;
    const session = JSON.parse(raw);
    pendingOrders = session.pendingOrders || {};
    if (!session.clientId) return false;
    const client = window.CLIENTS.find(c => c.id === session.clientId);
    if (!client) return false;
    cur = client;
    orderState = session.orderState || {};
    quarantine = session.quarantine || [];
    document.getElementById('ord-cname').textContent = cur.name;
    document.getElementById('ord-csub').innerHTML =
      `<i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${cur.shop}
       &nbsp;·&nbsp; <span class="rb rb-${cur.route}">${cur.routeLabel}</span>`;
    document.getElementById('sum-cname').textContent = cur.name;
    document.getElementById('sum-csub').textContent = `${cur.shop} — ${cur.routeLabel}`;
    renderOrder();
    // Επαναφορά σημειώσεων
    const notesEl = document.getElementById('order-notes');
    if (notesEl) {
      if (pendingOrders[cur.id] && pendingOrders[cur.id].notes) {
        notesEl.value = pendingOrders[cur.id].notes;
      } else {
        notesEl.value = session.notes || '';
      }
    }
    const target = session.screen === 's-summary' ? 's-order' : (session.screen || 's-order');
    show(target, false);
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
  if (id === 's-clients') filterClients('');
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
    btn.style.cssText = 'flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#1D9E75;color:#fff';
  } else {
    btn.style.cssText = 'flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:500;cursor:not-allowed;border:none;background:var(--color-background-secondary);color:var(--color-text-tertiary)';
  }
}

// ============================================================
// ΛΙΣΤΑ ΠΕΛΑΤΩΝ
// ============================================================

function filterClients(q) {
  const f = (q || '').toLowerCase();
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
      const hasPending = pendingOrders[c.id] &&
        (Object.values(pendingOrders[c.id].orderState || {}).some(s => s.on) ||
         (pendingOrders[c.id].quarantine || []).length > 0);
      html += `<div class="client-card" onclick="selectClient('${c.id}')">
        <div class="avatar av-${r.cls}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="client-name">
            ${c.name}
            ${hasPending ? '<span class="pending-badge"><i class="ti ti-clock" aria-hidden="true"></i> Εκκρεμής</span>' : ''}
          </div>
          <div class="client-meta">
            ${c.shop ? `<i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${c.shop}&nbsp;·&nbsp;` : ''}
            <i class="ti ti-map-pin" style="font-size:11px" aria-hidden="true"></i> ${c.city || '—'}
          </div>
        </div>
        <button onclick="event.stopPropagation();openEditClient('${c.id}')"
          style="border:none;background:transparent;padding:6px 8px;cursor:pointer;color:var(--color-text-tertiary)"
          aria-label="Επεξεργασία πελάτη">
          <i class="ti ti-settings" style="font-size:16px"></i>
        </button>
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
  // Αποθήκευση τρέχουσας παραγγελίας πριν αλλάξουμε πελάτη
  if (cur) saveSession();

  cur = window.CLIENTS.find(c => c.id === id);
  if (!cur) return;

  document.getElementById('ord-cname').textContent = cur.name;
  document.getElementById('ord-csub').innerHTML =
    `<i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${cur.shop}
     &nbsp;·&nbsp; <span class="rb rb-${cur.route}">${cur.routeLabel}</span>`;
  document.getElementById('sum-cname').textContent = cur.name;
  document.getElementById('sum-csub').textContent = `${cur.shop} — ${cur.routeLabel}`;

  // Επαναφορά εκκρεμούς παραγγελίας αν υπάρχει
  if (pendingOrders[cur.id]) {
    orderState = JSON.parse(JSON.stringify(pendingOrders[cur.id].orderState || {}));
    quarantine = JSON.parse(JSON.stringify(pendingOrders[cur.id].quarantine || []));
    setTimeout(() => {
      const notesEl = document.getElementById('order-notes');
      if (notesEl) notesEl.value = pendingOrders[cur.id].notes || '';
    }, 0);
  } else {
    orderState = {};
    quarantine = [];
    Object.entries(cur.history || {}).forEach(([cat, items]) => {
      Object.entries(items).forEach(([pid, qty]) => {
        const p = getProd(pid);
        if (p) orderState[pid] = { on: false, qty, unit: p.unit };
      });
    });
    setTimeout(() => {
      const notesEl = document.getElementById('order-notes');
      if (notesEl) notesEl.value = '';
    }, 0);
  }

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
  if (!cur) return;
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
    const zc = ZONE_ROW_COLORS[zk] || ZONE_ROW_COLORS.apo;
    zHTML[zk] += `<div class="cat-title">${cat}</div>`;
    showP.forEach(p => {
      const inH = !!(h[cat] || {})[p.id];
      const st = orderState[p.id] || { on: false, qty: (h[cat] || {})[p.id] || 1, unit: p.unit };
      const on = st.on;

      // Στυλ γραμμής: τσεκαρισμένο=πράσινο, ξετσεκάριστο=χρώμα ζώνης
      const rowStyle = on
        ? 'border-color:#1D9E75;background:#E1F5EE'
        : `border-color:${zc.border};background:${zc.bg}`;

      zHTML[zk] += `
        <div class="prow" style="${rowStyle}" id="row-${p.id}">
          <button class="check-btn${on ? ' on' : ''}" onclick="toggleP('${p.id}')" aria-label="${on ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}">
            <i class="ti ${on ? 'ti-check' : 'ti-plus'}" aria-hidden="true"></i>
          </button>
          <div style="flex:1;min-width:0">
            <div class="pname" style="color:${on ? '#1a1a1a' : '#444'}">${p.name}
              ${p.supplier && p.supplier !== '—' ? `<span class="sup-badge">${p.supplier}</span>` : ''}
              ${inH ? '<span class="badge b-hist">ιστορικό</span>' : '<span class="badge b-new">νέο</span>'}
            </div>
            <div class="unit-seg" id="useg-${p.id}">${unitSegHTML(p.id, st.unit)}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qbtn" onclick="chQty('${p.id}',-1)" id="qm-${p.id}">−</button>
            <span class="qdisplay" id="qty-${p.id}">${st.qty}</span>
            <button class="qbtn" onclick="chQty('${p.id}',1)" id="qp-${p.id}">+</button>
          </div>
          ${inH ? `<button onclick="removeFromHistory('${p.id}')" style="border:none;background:transparent;padding:4px 5px;cursor:pointer;color:#ccc;margin-left:2px" aria-label="Αφαίρεση από ιστορικό" title="Αφαίρεση από ιστορικό"><i class="ti ti-x" style="font-size:13px"></i></button>` : ''}
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
    orderState[pid] = { on: false, qty: 1, unit: p.unit };
  }
  orderState[pid].unit = unit;
  UNITS.forEach(u => {
    const b = document.getElementById(`ubtn-${pid}-${u}`);
    if (b) b.style.cssText = u === unit ? STY_ON : STY_OFF;
  });
  saveSession();
}

function toggleP(pid) {
  const p = getProd(pid);
  const h = cur.history || {};
  const cat = getCatOfProd(pid);
  if (!orderState[pid]) orderState[pid] = { on: false, qty: (h[cat] || {})[pid] || 1, unit: p.unit };
  orderState[pid].on = !orderState[pid].on;
  const on = orderState[pid].on;
  const zk = getZone(cat);
  const zc = ZONE_ROW_COLORS[zk] || ZONE_ROW_COLORS.apo;

  const row = document.getElementById('row-' + pid);
  if (row) {
    row.style.borderColor = on ? '#1D9E75' : zc.border;
    row.style.background  = on ? '#E1F5EE' : zc.bg;
  }
  const cb = row && row.querySelector('.check-btn');
  if (cb) {
    cb.className = `check-btn${on ? ' on' : ''}`;
    cb.innerHTML = `<i class="ti ${on ? 'ti-check' : 'ti-plus'}" aria-hidden="true"></i>`;
  }
  const pnameEl = row && row.querySelector('.pname');
  if (pnameEl) pnameEl.style.color = on ? '#1a1a1a' : '#444';

  saveSession();
}

function chQty(pid, d) {
  if (!orderState[pid]) {
    const p = getProd(pid);
    const h = cur.history || {};
    const cat = getCatOfProd(pid);
    orderState[pid] = { on: false, qty: (h[cat] || {})[pid] || 1, unit: p.unit };
  }
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

function removeFromHistory(pid) {
  if (!cur) return;
  // Αφαίρεση από το ιστορικό του πελάτη
  for (const cat of Object.keys(cur.history || {})) {
    if (cur.history[cat] && cur.history[cat][pid] !== undefined) {
      delete cur.history[cat][pid];
      if (Object.keys(cur.history[cat]).length === 0) delete cur.history[cat];
      break;
    }
  }
  // Αφαίρεση από το orderState
  delete orderState[pid];
  autoSave();
  renderOrder();
  showToast('Αφαιρέθηκε από το ιστορικό');
}

function renderQuarantine() {
  if (!quarantine.length) { document.getElementById('quarantine-section').innerHTML = ''; return; }
  let html = `<div class="zone-block" style="border-color:#EF9F27">
    <div class="zone-hdr" style="background:#FAEEDA;border-bottom:0.5px solid #FAC775">
      <i class="ti ti-clock" style="font-size:13px;color:#633806" aria-hidden="true"></i>
      <span class="zone-label" style="color:#633806">Καραντίνα — αναμένει επιβεβαίωση</span>
    </div><div class="zone-body">`;
  quarantine.forEach((p, i) => {
    html += `<div class="prow" style="border-color:#EF9F27;background:#FAEEDA">
      <div style="flex:1;min-width:0">
        <div class="pname">${p.name} <span class="badge b-new">νέο</span></div>
        <div class="pslang" style="color:#8a5a00">${p.cat}</div>
      </div>
      <div class="qty-ctrl">
        <button class="qbtn" onclick="chQQty(${i},-1)">−</button>
        <span class="qdisplay">${p.qty} ${p.unit}</span>
        <button class="qbtn" onclick="chQQty(${i},1)">+</button>
      </div>
      <button onclick="removeFromQuarantine(${i})" style="border:none;background:transparent;padding:4px 6px;cursor:pointer;color:#B91C1C;margin-left:4px" aria-label="Διαγραφή">
        <i class="ti ti-trash" style="font-size:14px"></i>
      </button>
    </div>`;
  });
  html += '</div></div>';
  document.getElementById('quarantine-section').innerHTML = html;
}

function removeFromQuarantine(i) {
  quarantine.splice(i, 1);
  renderQuarantine();
  saveSession();
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
  const allHits = hits;
  const shown = allHits.slice(0, 30);
  box.innerHTML = shown.map(p => {
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
  if (allHits.length > 30) {
    box.innerHTML += `<div style="text-align:center;font-size:11px;color:var(--color-text-tertiary);padding:6px">+${allHits.length - 30} ακόμη — γράψε πιο συγκεκριμένα</div>`;
  }
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
// ΚΑΤΑΛΟΓΟΣ — FIX: μοναδικά IDs με charCode
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
    // Μοναδικό ID: hash από charCodes — λύνει το bug accordion
    const accId = 'acc' + Array.from(cat).reduce((h, c) => h * 31 + c.charCodeAt(0), 0);
    html += `<div class="cat-acc-hdr" onclick="toggleAcc('${accId}')">
      <span style="font-size:11px;font-weight:500;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.6px">
        <i class="ti ${z.icon}" style="font-size:11px" aria-hidden="true"></i> ${cat}
      </span>
      <span style="font-size:11px;color:var(--color-text-tertiary)">${filtered.length} <i class="ti ti-chevron-down" aria-hidden="true"></i></span>
    </div>
    <div class="cat-acc-body${filter ? ' open' : ''}" id="${accId}">`;
    filtered.forEach(p => {
      const sel = catalogSelected.has(p.id);
      const isCustom = p.id.startsWith('custom_');
      html += `<div class="catalog-prow${sel ? ' selected' : ''}" onclick="toggleCatSel('${p.id}')">
        <i class="ti ${sel ? 'ti-check' : 'ti-circle'}" style="font-size:15px;color:${sel ? '#1D9E75' : 'var(--color-text-tertiary)'}" aria-hidden="true"></i>
        <div style="flex:1;min-width:0">
          <div class="pname">${p.name}${inHist.has(p.id) ? ' <span class="badge b-hist">ιστορικό</span>' : ''}${isCustom ? ' <span class="badge" style="background:#FFF3CD;color:#856404;border:1px solid #FFDF7E">custom</span>' : ''}</div>
          <div class="pslang">${p.supplier || ''}</div>
        </div>
        ${isCustom ? `<button onclick="event.stopPropagation();openEditProd('${p.id}')" style="border:none;background:transparent;padding:4px 6px;cursor:pointer;color:var(--color-text-tertiary)" aria-label="Επεξεργασία"><i class="ti ti-pencil" style="font-size:14px"></i></button>` : ''}
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
// CUSTOM ΠΡΟΪΟΝ — ΠΡΟΣΘΗΚΗ ΣΤΟ ΚΑΤΑΛΟΓΟ
// ============================================================

function addNewProd() {
  const cat  = document.getElementById('np-cat').value;
  const name = document.getElementById('np-name').value.trim();
  if (!cat || !name) return;
  const slang = document.getElementById('np-slang').value.trim();
  const qty   = parseInt(document.getElementById('np-qty').value) || 1;

  // Δημιουργία μοναδικού ID
  const pid = 'custom_' + Date.now();
  const newProd = { id: pid, name, slang: (slang || name).toLowerCase(), unit: npUnit, supplier: '' };

  // Προσθήκη στον κατάλογο
  if (!window.PRODUCTS[cat]) window.PRODUCTS[cat] = [];
  window.PRODUCTS[cat].push(newProd);

  // Αυτόματη ενεργοποίηση στην παραγγελία
  orderState[pid] = { on: true, qty, unit: npUnit };

  autoSave();

  // Καθαρισμός φόρμας
  document.getElementById('np-cat').value = '';
  document.getElementById('np-name').value = '';
  document.getElementById('np-slang').value = '';
  document.getElementById('np-qty').value = '1';
  document.getElementById('np-search').value = '';
  document.getElementById('live-results').style.display = 'none';

  renderCatalog('');
  renderOrder();
  show('s-order');
  showToast('Προστέθηκε στον κατάλογο!');
}

// ============================================================
// ΕΠΕΞΕΡΓΑΣΙΑ CUSTOM ΠΡΟΪΟΝΤΟΣ
// ============================================================

function openEditProd(pid) {
  const p = getProd(pid);
  if (!p) return;
  const cat = getCatOfProd(pid);

  const cats = Object.keys(window.PRODUCTS);
  const catOpts = cats.map(c => `<option value="${c}"${c===cat?' selected':''}>${c}</option>`).join('');
  const unitBtns = UNITS.map((u,i) => `<button onclick="editSetUnit('${u}',this)" style="${u===p.unit?'flex:1;padding:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:#1D9E75;color:#fff':'flex:1;padding:8px;font-size:12px;font-weight:500;border:none;cursor:pointer;background:#f0f0f0;color:#555'}">${ULABELS[u]}</button>`).join('');

  const modal = document.createElement('div');
  modal.id = 'edit-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end';
  modal.innerHTML = `
    <div style="background:#fff;width:100%;border-radius:16px 16px 0 0;padding:20px;max-height:85vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px;color:#1a1a1a">
        <i class="ti ti-pencil" style="color:var(--green)"></i> Επεξεργασία προϊόντος
      </div>
      <div class="field-label">Όνομα <span style="color:#e00">*</span></div>
      <input type="text" class="field-input" id="edit-name" value="${p.name}">
      <div class="field-label">Αργκό / αναζήτηση</div>
      <input type="text" class="field-input" id="edit-slang" value="${p.slang}">
      <div class="field-label">Προμηθευτής</div>
      <input type="text" class="field-input" id="edit-supplier" value="${p.supplier||''}">
      <div class="field-label">Κατηγορία</div>
      <select class="field-input" id="edit-cat">${catOpts}</select>
      <div class="field-label">Μονάδα</div>
      <div style="display:flex;gap:0;border-radius:8px;overflow:hidden;border:1px solid #ddd" id="edit-unit-seg">${unitBtns}</div>
      <input type="hidden" id="edit-unit-val" value="${p.unit}">
      <div class="modal-acts" style="margin-top:20px">
        <button onclick="confirmDeleteProd('${pid}')" style="padding:11px 14px;border-radius:var(--radius);font-size:14px;cursor:pointer;border:none;background:#FEE2E2;color:#B91C1C">
          <i class="ti ti-trash"></i>
        </button>
        <button class="btn-cancel" onclick="document.getElementById('edit-modal').remove()">Ακύρωση</button>
        <button onclick="saveEditProd('${pid}','${cat}')" style="flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#1D9E75;color:#fff">
          <i class="ti ti-check"></i> Αποθήκευση
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function editSetUnit(u, btn) {
  document.getElementById('edit-unit-val').value = u;
  btn.parentElement.querySelectorAll('button').forEach(b => {
    b.style.cssText = 'flex:1;padding:8px;font-size:12px;font-weight:500;border:none;cursor:pointer;background:#f0f0f0;color:#555';
  });
  btn.style.cssText = 'flex:1;padding:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:#1D9E75;color:#fff';
}

function saveEditProd(pid, oldCat) {
  const name     = document.getElementById('edit-name').value.trim();
  const slang    = document.getElementById('edit-slang').value.trim();
  const supplier = document.getElementById('edit-supplier').value.trim();
  const newCat   = document.getElementById('edit-cat').value;
  const unit     = document.getElementById('edit-unit-val').value;
  if (!name) { showToast('Το όνομα είναι υποχρεωτικό', 'error'); return; }

  // Αν άλλαξε κατηγορία, μετακίνηση
  if (newCat !== oldCat) {
    window.PRODUCTS[oldCat] = (window.PRODUCTS[oldCat] || []).filter(p => p.id !== pid);
    if (!window.PRODUCTS[newCat]) window.PRODUCTS[newCat] = [];
    window.PRODUCTS[newCat].push({ id: pid, name, slang: slang || name.toLowerCase(), unit, supplier });
  } else {
    const p = getProd(pid);
    if (p) { p.name = name; p.slang = slang || name.toLowerCase(); p.unit = unit; p.supplier = supplier; }
  }
  // Ενημέρωση unit στο orderState αν υπάρχει
  if (orderState[pid]) orderState[pid].unit = unit;

  autoSave();
  document.getElementById('edit-modal').remove();
  renderCatalog('');
  renderOrder();
  showToast('Αποθηκεύτηκε!');
}

function confirmDeleteProd(pid) {
  const p = getProd(pid);
  if (!confirm(`Διαγραφή "${p ? p.name : pid}" από τον κατάλογο;`)) return;
  const cat = getCatOfProd(pid);
  window.PRODUCTS[cat] = (window.PRODUCTS[cat] || []).filter(pr => pr.id !== pid);
  delete orderState[pid];
  autoSave();
  document.getElementById('edit-modal').remove();
  renderCatalog('');
  renderOrder();
  showToast('Διαγράφηκε');
}

// ============================================================
// ΣΥΝΟΛΑ ΑΝΑ ΚΑΤΗΓΟΡΙΑ
// ============================================================

function calcCatTotals(items) {
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
    showToast('Δεν έχεις τσεκάρει κανένα προϊόν!', 'error'); return;
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

  const notesVal = document.getElementById('order-notes') ? document.getElementById('order-notes').value.trim() : '';
  if (notesVal) {
    html += `<div class="sum-zone" style="border-color:#94a3b8"><div class="sum-zone-hdr" style="background:#f1f5f9;border-bottom:0.5px solid #cbd5e1"><i class="ti ti-notes" style="color:#64748b"></i> <span style="color:#475569">Σημειώσεις / Εκκρεμότητες</span></div><div class="sum-body"><div style="font-size:13px;color:#333;white-space:pre-wrap;padding:4px 0">${notesVal}</div></div></div>`;
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
  const notesVal = (document.getElementById('order-notes') ? document.getElementById('order-notes').value.trim() : '');
  if (notesVal) {
    txt += '=== ΣΗΜΕΙΩΣΕΙΣ / ΕΚΚΡΕΜΟΤΗΤΕΣ ===\n' + notesVal + '\n';
  }
  navigator.clipboard.writeText(txt)
    .then(() => {
      if (cur) {
        if (!cur.history) cur.history = {};
        Object.entries(orderState).forEach(([pid, st]) => {
          if (!st.on) return;
          const cat = getCatOfProd(pid);
          if (!cat) return;
          if (!cur.history[cat]) cur.history[cat] = {};
          cur.history[cat][pid] = st.qty;
        });
        autoSave();
        delete pendingOrders[cur.id];
        // Καθαρισμός σημειώσεων
        const notesEl = document.getElementById('order-notes');
        if (notesEl) notesEl.value = '';
        saveSession();
      }
      showToast('Αντιγράφηκε! ✓');
    })
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
// ΝΕΟΣ ΠΕΛΑΤΗΣ & ΔΡΟΜΟΛΟΓΙΟ
// ============================================================

function openNewClient() {
  // Καθαρισμός φόρμας
  ['nc-name','nc-shop','nc-city','nc-tel','nc-mobile','nc-address'].forEach(id => {
    document.getElementById(id).value = '';
  });
  populateRouteSelect('nc-route');
  checkNcReady();
  show('s-newclient');
}

function populateRouteSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Επίλεξε δρομολόγιο...</option>';
  ROUTES.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.key;
    opt.textContent = r.label;
    sel.appendChild(opt);
  });
}

function checkNcReady() {
  const name = document.getElementById('nc-name').value.trim();
  const btn  = document.getElementById('btn-nc');
  if (name) {
    btn.style.cssText = 'flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#1D9E75;color:#fff';
  } else {
    btn.style.cssText = 'flex:1;padding:11px;border-radius:var(--radius);font-size:14px;cursor:not-allowed;border:none;background:#e5e5e5;color:#aaa';
  }
}

function saveNewClient() {
  const name    = document.getElementById('nc-name').value.trim();
  if (!name) { showToast('Συμπλήρωσε τουλάχιστον το όνομα', 'error'); return; }
  const shop    = document.getElementById('nc-shop').value.trim();
  const city    = document.getElementById('nc-city').value.trim();
  const routeKey= document.getElementById('nc-route').value;
  const tel     = document.getElementById('nc-tel').value.trim();
  const mobile  = document.getElementById('nc-mobile').value.trim();
  const address = document.getElementById('nc-address').value.trim();

  const route = ROUTES.find(r => r.key === routeKey);
  const newClient = {
    id: 'c_' + Date.now(),
    name, shop, city,
    route: routeKey || '',
    routeLabel: route ? route.label : '',
    tel, mobile, address,
    history: {},
  };
  window.CLIENTS.push(newClient);
  autoSave();
  showToast(`${name} προστέθηκε!`);
  show('s-clients');
}

function openEditClient(cid) {
  const c = window.CLIENTS.find(cl => cl.id === cid);
  if (!c) return;
  const routeOpts = ROUTES.map(r =>
    `<option value="${r.key}"${r.key === c.route ? ' selected' : ''}>${r.label}</option>`
  ).join('');
  const modal = document.createElement('div');
  modal.id = 'edit-client-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end';
  modal.innerHTML = `
    <div style="background:#fff;width:100%;border-radius:16px 16px 0 0;padding:20px;max-height:90vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px">
        <i class="ti ti-user-edit" style="color:var(--green)"></i> Επεξεργασία πελάτη
      </div>
      <div class="field-label">Όνομα / Επίθετο <span style="color:#e00">*</span></div>
      <input type="text" class="field-input" id="ec-name" value="${c.name || ''}">
      <div class="field-label">Επωνυμία καταστήματος</div>
      <input type="text" class="field-input" id="ec-shop" value="${c.shop || ''}">
      <div class="field-label">Πόλη / Περιοχή</div>
      <input type="text" class="field-input" id="ec-city" value="${c.city || ''}">
      <div class="field-label">Δρομολόγιο</div>
      <select class="field-input" id="ec-route">
        <option value="">— Χωρίς δρομολόγιο —</option>
        ${routeOpts}
      </select>
      <div class="field-label">Σταθερό τηλέφωνο</div>
      <input type="tel" class="field-input" id="ec-tel" value="${c.tel || ''}">
      <div class="field-label">Κινητό</div>
      <input type="tel" class="field-input" id="ec-mobile" value="${c.mobile || ''}">
      <div class="field-label">Διεύθυνση</div>
      <input type="text" class="field-input" id="ec-address" value="${c.address || ''}">
      <div class="modal-acts" style="margin-top:20px">
        <button onclick="deleteClient('${cid}')"
          style="padding:11px 14px;border-radius:var(--radius);font-size:14px;cursor:pointer;border:none;background:#FEE2E2;color:#B91C1C">
          <i class="ti ti-trash"></i>
        </button>
        <button class="btn-cancel" onclick="document.getElementById('edit-client-modal').remove()">Ακύρωση</button>
        <button onclick="saveEditClient('${cid}')"
          style="flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#1D9E75;color:#fff">
          <i class="ti ti-check"></i> Αποθήκευση
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function saveEditClient(cid) {
  const name = document.getElementById('ec-name').value.trim();
  if (!name) { showToast('Το όνομα είναι υποχρεωτικό', 'error'); return; }
  const c = window.CLIENTS.find(cl => cl.id === cid);
  if (!c) return;
  const routeKey = document.getElementById('ec-route').value;
  const route = ROUTES.find(r => r.key === routeKey);
  c.name    = name;
  c.shop    = document.getElementById('ec-shop').value.trim();
  c.city    = document.getElementById('ec-city').value.trim();
  c.route   = routeKey;
  c.routeLabel = route ? route.label : '';
  c.tel     = document.getElementById('ec-tel').value.trim();
  c.mobile  = document.getElementById('ec-mobile').value.trim();
  c.address = document.getElementById('ec-address').value.trim();
  autoSave();
  document.getElementById('edit-client-modal').remove();
  filterClients('');
  showToast('Αποθηκεύτηκε!');
}

function deleteClient(cid) {
  const c = window.CLIENTS.find(cl => cl.id === cid);
  if (!confirm(`Διαγραφή πελάτη "${c ? c.name : ''}";\nΘα διαγραφεί και το ιστορικό παραγγελιών του.`)) return;
  window.CLIENTS = window.CLIENTS.filter(cl => cl.id !== cid);
  delete pendingOrders[cid];
  autoSave();
  saveSession();
  document.getElementById('edit-client-modal').remove();
  filterClients('');
  showToast('Ο πελάτης διαγράφηκε');
}

function openNewRoute() {
  document.getElementById('nr-label').value = '';
  document.getElementById('nr-key').value = '';
  const modal = document.getElementById('route-modal');
  modal.style.display = 'flex';
}

function closeRouteModal() {
  document.getElementById('route-modal').style.display = 'none';
}

function saveNewRoute() {
  const label = document.getElementById('nr-label').value.trim();
  const key   = document.getElementById('nr-key').value.trim();
  if (!label || !key) { showToast('Συμπλήρωσε και τα δύο πεδία', 'error'); return; }
  if (ROUTES.find(r => r.key === key)) { showToast('Αυτός ο κωδικός υπάρχει ήδη', 'error'); return; }
  ROUTES.push({ key, label, cls: key });
  closeRouteModal();
  populateRouteSelect('nc-route');
  document.getElementById('nc-route').value = key;
  checkNcReady();
  showToast(`Δρομολόγιο "${label}" προστέθηκε!`);
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  // Φόρτωση pendingOrders από session
  try {
    const raw = localStorage.getItem('orderapp_session');
    if (raw) {
      const s = JSON.parse(raw);
      pendingOrders = s.pendingOrders || {};
    }
  } catch(e) {}
  filterClients('');
  renderCatalog('');
  document.getElementById('restore-input').addEventListener('change', e => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });
  restoreSession();
});
