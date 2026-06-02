// ============================================================
// ΚΥΡΙΑ ΛΟΓΙΚΗ ΕΦΑΡΜΟΓΗΣ — v1.2
// ============================================================

const UNITS = ['κιβ', 'κιλα', 'τεμ'];
const ULABELS = { 'κιβ': 'Κιβ', 'κιλα': 'Κιλα', 'τεμ': 'Σακ/Τεμ' };
const STY_ON  = 'padding:4px 9px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:#1D9E75;color:#fff;transition:all 0.15s';
const STY_OFF = 'padding:4px 9px;font-size:11px;font-weight:500;border:none;cursor:pointer;background:transparent;color:var(--color-text-secondary);transition:all 0.15s';

// Χρωματα ζωνης για αντσεκαριστες γραμμες
const ZONE_ROW_COLORS = {
  kty: { bg: '#EFF6FD', border: '#B5D4F4' },
  syn: { bg: '#F0FAF5', border: '#9FE1CB' },
  apo: { bg: '#F7F6F2', border: '#D3D1C7' },
};

let cur = null;
let orderState = {};    // { pid: { on, qty, unit } }
let quarantine = [];
let historyMode = false; // true = επεξεργασια ιστορικου πελατη
let npUnit = 'τεμ';
let micOn = false, recog = null;
let currentScreen = 's-clients';

// Εκκρεμεις παραγγελιες ανα πελατη: { clientId: { orderState, quarantine } }
let pendingOrders = {};

// ============================================================
// ΑΠΟΘΗΚΕΥΣΗ SESSION
// ============================================================

function saveSession() {
  try {
    // Μην αποθηκευεις session σε historyMode — θα μπερδευε την επομενη εκκινηση
    if (historyMode) return;
    if (cur) {
      const hasItems = Object.values(orderState).some(s => s.on) || quarantine.length > 0;
      const hasPendingItems = cur.pendingItems && cur.pendingItems.length > 0;
      const notes = document.getElementById('order-notes') ? document.getElementById('order-notes').value : '';
      if (hasItems || notes || hasPendingItems) {
        pendingOrders[cur.id] = { orderState: JSON.parse(JSON.stringify(orderState)), quarantine: JSON.parse(JSON.stringify(quarantine)), notes, pendingItems: JSON.parse(JSON.stringify(cur.pendingItems || [])) };
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
    // Αν το session ειναι απο historyMode, καθαρισμος και επιστροφη στη λιστα
    if (session.screen === 's-newprod') {
      localStorage.removeItem('orderapp_session');
      return false;
    }
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
    // Επαναφορα σημειωσεων
    const notesEl = document.getElementById('order-notes');
    if (notesEl) {
      if (pendingOrders[cur.id] && pendingOrders[cur.id].notes) {
        notesEl.value = pendingOrders[cur.id].notes;
      } else {
        notesEl.value = session.notes || '';
      }
    }
    // Αγνοουμε οθονες που δεν εχουν νοημα χωρις context
    const badScreens = ['s-newprod', 's-catalog', 's-print'];
    const target = session.screen === 's-summary' ? 's-order'
                 : badScreens.includes(session.screen) ? 's-clients'
                 : (session.screen || 's-order');
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
  if (id === 's-clients') {
    filterClients('');
    // Επαναφορα scroll position
    const savedScroll = sessionStorage.getItem('clients_scroll');
    if (savedScroll) {
      setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 50);
      sessionStorage.removeItem('clients_scroll');
    }
  }
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
  const ready = !!(name && cat);
  const onStyle  = 'flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;color:#fff;pointer-events:auto;';
  const offStyle = 'flex:1;padding:11px;border-radius:var(--radius);font-size:14px;cursor:not-allowed;border:none;background:#e5e5e5;color:#aaa;pointer-events:none';
  const bp = document.getElementById('btn-q-pending');
  const bh = document.getElementById('btn-q-history');
  if (bp) bp.style.cssText = ready ? onStyle + 'background:#EF9F27' : offStyle;
  if (bh) bh.style.cssText = ready ? onStyle + 'background:#1D9E75' : offStyle;
}

// ============================================================
// ΝΕΟ ΠΡΟΪΟΝ — 2 επιλογες: Ιστορικο η Εκκρεμοτητα
// ============================================================

function addNewProd(mode) {
  const cat  = document.getElementById('np-cat').value;
  const name = document.getElementById('np-name').value.trim();
  if (!cat || !name) return;
  const slang = document.getElementById('np-slang').value.trim();
  const qty   = parseInt(document.getElementById('np-qty').value) || 1;

  // Στο historyMode ΔΕΝ δημιουργουμε νεο προιον στον καταλογο
  // Μονο αν ειμαστε σε κανονικη λειτουργια δημιουργειται custom
  if (historyMode) {
    showToast('Στο χτισιμο ιστορικου χρησιμοποιησε μονο προιοντα απο τον καταλογο', 'error');
    return;
  }

  const pid = 'custom_' + Date.now();
  const newProd = { id: pid, name, slang: (slang || name).toLowerCase(), unit: npUnit, supplier: '' };
  if (!window.PRODUCTS[cat]) window.PRODUCTS[cat] = [];
  window.PRODUCTS[cat].push(newProd);

  if (mode === 'history') {
    if (!cur) { showToast('Επιλεξε πρωτα πελατη!', 'error'); return; }
    if (!cur.history) cur.history = {};
    if (!cur.history[cat]) cur.history[cat] = {};
    cur.history[cat][pid] = qty;
    orderState[pid] = { on: false, qty, unit: npUnit };
    autoSave();
    showToast('✓ Προστεθηκε στο ιστορικο!');
  } else {
    if (cur) {
      if (!cur.pendingItems) cur.pendingItems = [];
      cur.pendingItems.push({ pid, name, cat, qty, unit: npUnit, addedAt: Date.now() });
    }
    autoSave();
    showToast('⏳ Προστεθηκε στις εκκρεμοτητες!');
  }

  // Καθαρισμος φορμας
  document.getElementById('np-cat').value = '';
  document.getElementById('np-name').value = '';
  document.getElementById('np-slang').value = '';
  document.getElementById('np-qty').value = '1';
  document.getElementById('np-search').value = '';
  document.getElementById('live-results').innerHTML = '';
  checkQReady();

  renderCatalog('');
  renderOrder();
  renderPendingItems();
  show('s-order');
}

// ============================================================
// ΛΙΣΤΑ ΠΕΛΑΤΩΝ
// ============================================================

function filterClients(q) {
  const f = (q || '').toLowerCase();
  const filtered = window.CLIENTS.filter(c =>
    c.name.toLowerCase().includes(f) ||
    (c.shop || '').toLowerCase().includes(f) ||
    (c.city || '').toLowerCase().includes(f)
  );
  const byRoute = {};
  filtered.forEach(c => {
    if (!byRoute[c.route]) byRoute[c.route] = [];
    byRoute[c.route].push(c);
  });
  // Αλφαβητικη σειρα ανα δρομολογιο
  Object.values(byRoute).forEach(arr => arr.sort((a,b) => a.name.localeCompare(b.name, 'el')));
  let html = '';
  ROUTES.forEach(r => {
    if (!byRoute[r.key] || !byRoute[r.key].length) return;
    html += `<div class="route-title route-${r.cls}"><i class="ti ti-route" aria-hidden="true"></i> ${r.label}</div>`;
    byRoute[r.key].forEach(c => {
      const initials = c.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const hasPending = (pendingOrders[c.id] &&
        (Object.values(pendingOrders[c.id].orderState || {}).some(s => s.on) ||
         (pendingOrders[c.id].quarantine || []).length > 0)) ||
        (c.pendingItems && c.pendingItems.length > 0);
      const pq = getPrintQueue();
      const inQueue = pq.some(o => o.clientId === c.id);
      html += `<div class="client-card" id="card-${c.id}" onclick="selectClient('${c.id}')"${inQueue ? ' style="border:1.5px solid var(--green);background:var(--green-light)"' : ''}>
        <div class="avatar av-${r.cls}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="client-name">${c.name}${hasPending ? ' <span class="pending-badge"><i class="ti ti-clock" style="font-size:9px"></i> Εκκρεμης</span>' : ''}</div>
          ${c.shop ? `<div class="client-meta"><i class="ti ti-building-store" style="font-size:11px"></i> ${c.shop}</div>` : ''}
        </div>
        <button class="btn btn-sm" style="flex-shrink:0;font-size:12px;padding:4px 10px;background:#f0f0f0;color:#333;border:0.5px solid #ddd" onclick="event.stopPropagation();openEditClient('${c.id}')">Επεξεργασια</button>
      </div>`;
    });
  });
  document.getElementById('client-list').innerHTML = html ||
    '<div style="color:var(--color-text-tertiary);font-size:13px;padding:1rem 0;text-align:center">Δεν βρεθηκαν πελατες</div>';
  updatePrintBanner();
}

// ============================================================
// ΕΠΙΛΟΓΗ ΠΕΛΑΤΗ
// ============================================================

function selectClient(id) {
  sessionStorage.setItem('clients_scroll', window.scrollY);
  // Αποθηκευση τρεχουσας παραγγελιας πριν αλλαξουμε πελατη
  if (cur) saveSession();

  cur = window.CLIENTS.find(c => c.id === id);
  if (!cur) return;

  document.getElementById('ord-cname').textContent = cur.name;
  document.getElementById('ord-csub').innerHTML =
    `<i class="ti ti-building-store" style="font-size:11px" aria-hidden="true"></i> ${cur.shop}
     &nbsp;·&nbsp; <span class="rb rb-${cur.route}">${cur.routeLabel}</span>`;
  document.getElementById('sum-cname').textContent = cur.name;
  document.getElementById('sum-csub').textContent = `${cur.shop} — ${cur.routeLabel}`;

  // Επαναφορα εκκρεμους παραγγελιας αν υπαρχει
  if (pendingOrders[cur.id]) {
    orderState = JSON.parse(JSON.stringify(pendingOrders[cur.id].orderState || {}));
    quarantine = JSON.parse(JSON.stringify(pendingOrders[cur.id].quarantine || []));
    // Επαναφορα pendingItems αν υπαρχουν στο session
    if (pendingOrders[cur.id].pendingItems && pendingOrders[cur.id].pendingItems.length) {
      cur.pendingItems = JSON.parse(JSON.stringify(pendingOrders[cur.id].pendingItems));
    }
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
        if (p) orderState[pid] = { on: false, qty: 0, unit: p.unit };
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
      (orderState[p.id] && !allHistIds.includes(p.id))
    );
    if (!showP.length) return;
    const zk = getZone(cat);
    const zc = ZONE_ROW_COLORS[zk] || ZONE_ROW_COLORS.apo;
    zHTML[zk] += `<div class="cat-title">${cat}</div>`;
    showP.forEach(p => {
      const inH = !!(h[cat] || {})[p.id];
      const st = orderState[p.id] || { on: false, qty: (h[cat] || {})[p.id] || 1, unit: p.unit };
      const on = st.on;

      // Στυλ γραμμης: τσεκαρισμενο=πρασινο, ξετσεκαριστο=χρωμα ζωνης
      const rowStyle = on
        ? 'border-color:#1D9E75;background:#E1F5EE'
        : `border-color:${zc.border};background:${zc.bg}`;

      zHTML[zk] += `
        <div class="prow" style="${rowStyle}" id="row-${p.id}">
          <button class="check-btn${on ? ' on' : ''}" onclick="toggleP('${p.id}')" aria-label="${on ? 'Απενεργοποιηση' : 'Ενεργοποιηση'}">
            <i class="ti ${on ? 'ti-check' : 'ti-plus'}" aria-hidden="true"></i>
          </button>
          <div style="flex:1;min-width:0">
            <div class="pname" style="color:${on ? '#1a1a1a' : '#444'}">${p.name}
              ${p.supplier && p.supplier !== '—' ? `<span class="sup-badge">${p.supplier}</span>` : ''}
              ${inH ? '<span class="badge b-hist">ιστορικο</span>' : '<span class="badge b-new">νεο</span>'}
            </div>
            <div class="unit-seg" id="useg-${p.id}">${unitSegHTML(p.id, st.unit)}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qbtn" onclick="chQty('${p.id}',-1)" id="qm-${p.id}">−</button>
            <span class="qdisplay" id="qty-${p.id}">${st.qty}</span>
            <button class="qbtn" onclick="chQty('${p.id}',1)" id="qp-${p.id}">+</button>
          </div>
          ${inH ? '' : ''}
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
  renderPendingItems();
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
    orderState[pid] = { on: false, qty: 0, unit: p.unit };
  }
  const newQty = Math.max(0, orderState[pid].qty + d);
  orderState[pid].qty = newQty;
  // Αν φτασει 0 και ηταν τσεκαρισμενο, ξετσεκαρισμα
  if (newQty === 0 && orderState[pid].on) {
    orderState[pid].on = false;
    renderOrder();
    saveSession();
    return;
  }
  const el = document.getElementById('qty-' + pid);
  if (el) el.textContent = newQty;
  saveSession();
}

function chQQty(i, d) {
  quarantine[i].qty = Math.max(1, quarantine[i].qty + d);
  renderQuarantine();
  renderPendingItems();
  saveSession();
}

function removeFromHistory(pid) {
  if (!cur) return;
  // Αφαιρεση απο το ιστορικο του πελατη
  for (const cat of Object.keys(cur.history || {})) {
    if (cur.history[cat] && cur.history[cat][pid] !== undefined) {
      delete cur.history[cat][pid];
      if (Object.keys(cur.history[cat]).length === 0) delete cur.history[cat];
      break;
    }
  }
  // Αφαιρεση απο το orderState
  delete orderState[pid];
  autoSave();
  renderOrder();
  showToast('Αφαιρεθηκε απο το ιστορικο');
}

function renderQuarantine() {
  if (!quarantine.length) { document.getElementById('quarantine-section').innerHTML = ''; return; }
  let html = `<div class="zone-block" style="border-color:#EF9F27">
    <div class="zone-hdr" style="background:#FAEEDA;border-bottom:0.5px solid #FAC775">
      <i class="ti ti-clock" style="font-size:13px;color:#633806" aria-hidden="true"></i>
      <span class="zone-label" style="color:#633806">Καραντινα — αναμενει επιβεβαιωση</span>
    </div><div class="zone-body">`;
  quarantine.forEach((p, i) => {
    html += `<div class="prow" style="border-color:#EF9F27;background:#FAEEDA">
      <div style="flex:1;min-width:0">
        <div class="pname">${p.name} <span class="badge b-new">νεο</span></div>
        <div class="pslang" style="color:#8a5a00">${p.cat}</div>
      </div>
      <div class="qty-ctrl">
        <button class="qbtn" onclick="chQQty(${i},-1)">−</button>
        <span class="qdisplay">${p.qty} ${p.unit}</span>
        <button class="qbtn" onclick="chQQty(${i},1)">+</button>
      </div>
      <button onclick="removeFromQuarantine(${i})" style="border:none;background:transparent;padding:4px 6px;cursor:pointer;color:#B91C1C;margin-left:4px" aria-label="Διαγραφη">
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
  renderPendingItems();
  saveSession();
}

function addTextPendingItem() {
  const inp = document.getElementById('pending-text-input');
  const text = inp ? inp.value.trim() : '';
  if (!text || !cur) return;
  if (!cur.pendingItems) cur.pendingItems = [];
  cur.pendingItems.push({ type: 'text', text, addedAt: Date.now() });
  inp.value = '';
  autoSave();
  renderPendingItems();
}

// ============================================================
// ΕΚΚΡΕΜΟΤΗΤΕΣ ΠΕΛΑΤΗ (pendingItems)
// ============================================================

function renderPendingItems() {
  const el = document.getElementById('pending-items-section');
  if (!el) return;
  const items = cur && cur.pendingItems && cur.pendingItems.length ? cur.pendingItems : [];
  if (!items.length) { el.innerHTML = ''; return; }

  let html = '';
  items.forEach((item, i) => {
    const isText = item.type === 'text';
    if (isText) {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:6px;background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px">
        <i class="ti ti-clock" style="color:#D97706;font-size:14px;flex-shrink:0"></i>
        <div style="flex:1;font-size:13px;font-weight:600;color:#92400E">${item.text}</div>
        <button onclick="confirmPendingItem(${i},'skip')" style="border:none;background:#f0f0f0;color:#666;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer">Παραλειψη</button>
        <button onclick="confirmPendingItem(${i},'delete')" style="border:none;background:transparent;color:#ccc;padding:4px;cursor:pointer"><i class="ti ti-x" style="font-size:13px"></i></button>
      </div>`;
    } else {
      const qty = item.qty || 1;
      html += `<div style="padding:10px;margin-bottom:8px;background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <i class="ti ti-clock" style="color:#D97706;font-size:14px;flex-shrink:0"></i>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;color:#92400E">${item.name}</div>
            <div style="font-size:11px;color:#B45309">${item.cat}</div>
          </div>
          <button onclick="confirmPendingItem(${i},'delete')" style="border:none;background:transparent;color:#ccc;padding:4px;cursor:pointer"><i class="ti ti-x" style="font-size:13px"></i></button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:12px;color:#B45309;font-weight:600">Ποσοτητα:</span>
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="chPendingQty(${i},-1)" style="width:30px;height:30px;border-radius:50%;border:1px solid #FCD34D;background:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#D97706">−</button>
            <span id="pqty-${i}" style="font-size:16px;font-weight:700;min-width:24px;text-align:center;color:#92400E">${qty}</span>
            <button onclick="chPendingQty(${i},1)" style="width:30px;height:30px;border-radius:50%;border:1px solid #FCD34D;background:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#D97706">+</button>
            <span style="font-size:12px;color:#B45309">${item.unit || 'τεμ'}</span>
          </div>
        </div>
        <textarea id="pnote-${i}" placeholder="Σημειωση για αυτο το προιον..."
          oninput="savePendingNote(${i},this.value)"
          style="width:100%;box-sizing:border-box;padding:7px;font-size:12px;font-family:inherit;border:1px solid #FCD34D;border-radius:7px;background:#fff;resize:none;outline:none;min-height:48px">${item.note || ''}</textarea>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button onclick="confirmPendingItem(${i},'history')" style="flex:1;border:none;background:#1D9E75;color:#fff;padding:8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">→ Ιστορικο</button>
          <button onclick="confirmPendingItem(${i},'skip')" style="flex:1;border:1px solid #FCD34D;background:#fff;color:#D97706;padding:8px;border-radius:8px;font-size:13px;cursor:pointer">Παραλειψη</button>
        </div>
      </div>`;
    }
  });
  el.innerHTML = html;
}

function chPendingQty(i, d) {
  if (!cur || !cur.pendingItems || !cur.pendingItems[i]) return;
  cur.pendingItems[i].qty = Math.max(1, (cur.pendingItems[i].qty || 1) + d);
  document.getElementById(`pqty-${i}`).textContent = cur.pendingItems[i].qty;
  autoSave();
}

function savePendingNote(i, val) {
  if (!cur || !cur.pendingItems || !cur.pendingItems[i]) return;
  cur.pendingItems[i].note = val;
  autoSave();
}

function confirmPendingItem(i, action) {
  if (!cur || !cur.pendingItems) return;
  const item = cur.pendingItems[i];
  if (!item) return;

  if (action === 'history') {
    // Μεταφορα στο ιστορικο
    if (!cur.history) cur.history = {};
    if (!cur.history[item.cat]) cur.history[item.cat] = {};
    cur.history[item.cat][item.pid] = item.qty;
    // Ενεργοποιηση στην παραγγελια αν δεν υπαρχει ηδη
    if (!orderState[item.pid]) {
      const p = getProd(item.pid);
      orderState[item.pid] = { on: false, qty: item.qty, unit: item.unit || (p ? p.unit : 'τεμ') };
    }
    cur.pendingItems.splice(i, 1);
    autoSave();
    renderOrder();
    renderPendingItems();
    showToast('✓ Περασε στο ιστορικο!');
  } else if (action === 'skip') {
    // Παραλειψη — μενει εκκρεμης για την επομενη φορα
    showToast('Παρεμεινε εκκρεμης');
    renderPendingItems();
  } else if (action === 'delete') {
    cur.pendingItems.splice(i, 1);
    autoSave();
    renderPendingItems();
    showToast('Διαγραφηκε');
  }
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
    box.innerHTML = '<div class="live-no-results"><i class="ti ti-info-circle" aria-hidden="true"></i> Δεν βρεθηκε — συμπληρωσε παρακατω για καραντινα</div>';
    box.style.display = 'block'; return;
  }
  const allHistIds = new Set(Object.values(cur && cur.history || {}).flatMap(o => Object.keys(o)));
  const allHits = hits;
  const shown = allHits.slice(0, 30);
  box.innerHTML = shown.map(p => {
    const already = allHistIds.has(p.id);
    const cat = getCatOfProd(p.id);
    const z = ZONES[getZone(cat)];
    const isPending = cur && cur.pendingItems && cur.pendingItems.find(i => i.pid === p.id);
    return `<div style="padding:10px 12px;border-bottom:0.5px solid var(--color-border);background:${already ? '#f0faf5' : '#fff'}">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
        <i class="ti ${z.icon}" style="font-size:13px;color:var(--color-text-tertiary);margin-top:3px;flex-shrink:0"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;line-height:1.3">${p.name}
            ${already ? '<span class="badge b-hist" style="font-size:10px">ιστορικο</span>' : ''}
            ${isPending ? '<span class="badge" style="background:#FEF3C7;color:#D97706;border:1px solid #FCD34D;font-size:10px">εκκρεμει</span>' : ''}
          </div>
          <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:2px">${cat}${p.supplier ? ' · ' + p.supplier : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="quickAddPending('${p.id}')"
          style="flex:1;padding:8px;border:none;background:#FFFBEB;color:#D97706;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #FCD34D">
          <i class="ti ti-clock" style="font-size:12px"></i> Εκκρεμοτητα
        </button>
        <button onclick="quickAdd('${p.id}')"
          style="flex:1;padding:8px;border:none;background:#F0FDF4;color:#16A34A;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #86EFAC">
          <i class="ti ti-history" style="font-size:12px"></i> ${already ? 'Ενεργοποιηση' : 'Παραγγελια / Ιστορικο'}
        </button>
      </div>
    </div>`;
  }).join('');
  if (allHits.length > 30) {
    box.innerHTML += `<div style="text-align:center;font-size:11px;color:var(--color-text-tertiary);padding:6px">+${allHits.length - 30} ακομη — γραψε πιο συγκεκριμενα</div>`;
  }
  box.style.display = 'block';
}

function quickAddPending(pid) {
  const p = getProd(pid);
  if (!p || !cur) return;
  const cat = getCatOfProd(pid);
  if (!cur.pendingItems) cur.pendingItems = [];
  // Αποφυγη διπλοεγγραφης
  if (cur.pendingItems.find(i => i.pid === pid)) {
    showToast('Ηδη στις εκκρεμοτητες');
    return;
  }
  cur.pendingItems.push({ pid, name: p.name, cat, qty: 1, unit: p.unit, addedAt: Date.now() });
  autoSave();
  renderPendingItems();
  showToast(`⏳ ${p.name.substring(0,25)} → εκκρεμοτητες`);
}

function quickAdd(pid) {
  const p = getProd(pid);
  if (!p) return;
  if (historyMode) {
    const cat = getCatOfProd(pid);
    if (cat) {
      if (!cur.history) cur.history = {};
      if (!cur.history[cat]) cur.history[cat] = {};
      cur.history[cat][pid] = 1;
      autoSave();
      showToast(`✓ ${p.name.substring(0,25)} → ιστορικο`);
      // Καθαρισμος search — παραμενουμε στην ιδια σελιδα
      const inp = document.getElementById('np-search');
      if (inp) { inp.value = ''; }
      const box = document.getElementById('live-results');
      if (box) { box.style.display = 'none'; box.innerHTML = ''; }
      const q = document.getElementById('np-search') ? document.getElementById('np-search').value : '';
      if (q) liveSearch(q);
    }
  } else {
    // Ατσεκαριστο, qty=0 — ο χρηστης επιλεγει μονος του
    if (!orderState[pid]) orderState[pid] = { on: false, qty: 0, unit: p.unit };
    // Καθαρισμος search
    const inp = document.getElementById('np-search');
    if (inp) { inp.value = ''; }
    const box = document.getElementById('live-results');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    renderOrder();
    show('s-order');
  }
}

// ============================================================
// ΚΑΤΑΛΟΓΟΣ — FIX: μοναδικα IDs με charCode
// ============================================================

function filterCatalog(q) { renderCatalog(q.toLowerCase().trim()); }

function renderCatalog(filter = '') {
  let html = '';
  Object.entries(window.PRODUCTS).forEach(([cat, prods]) => {
    if (!prods.length) return;
    const filterNorm = typeof normalizeSearch === 'function' ? normalizeSearch(filter) : filter;
    const filtered = filter
      ? prods.filter(p =>
          p.name.toLowerCase().includes(filter) ||
          normalizeSearch(p.name).includes(filterNorm) ||
          normalizeSearch(p.slang).includes(filterNorm) ||
          normalizeSearch(p.supplier || '').includes(filterNorm))
      : prods;
    if (!filtered.length) return;
    const zk = getZone(cat);
    const z = ZONES[zk];
    const inHist = new Set(Object.keys((cur && cur.history && cur.history[cat]) || {}));
    // Μοναδικο ID: hash απο charCodes — λυνει το bug accordion
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
          <div class="pname">${p.name}${inHist.has(p.id) ? ' <span class="badge b-hist">ιστορικο</span>' : ''}${isCustom ? ' <span class="badge" style="background:#FFF3CD;color:#856404;border:1px solid #FFDF7E">custom</span>' : ''}</div>
          <div class="pslang">${p.supplier || ''}</div>
        </div>
        ${isCustom ? `<button onclick="event.stopPropagation();openEditProd('${p.id}')" style="border:none;background:transparent;padding:4px 6px;cursor:pointer;color:var(--color-text-tertiary)" aria-label="Επεξεργασια"><i class="ti ti-pencil" style="font-size:14px"></i></button>` : `<button onclick="event.stopPropagation();openEditProdName('${p.id}')" style="border:none;background:transparent;padding:4px 6px;cursor:pointer;color:var(--color-text-tertiary)" aria-label="Επεξεργασια ονοματος"><i class="ti ti-pencil" style="font-size:14px"></i></button>`}
      </div>`;
    });
    html += '</div>';
  });
  document.getElementById('catalog-list').innerHTML = html ||
    '<div style="color:var(--color-text-tertiary);font-size:13px;padding:1rem 0">Δεν βρεθηκαν αποτελεσματα</div>';
  updateSelBtn();
}

function openEditProdName(pid) {
  const p = getProd(pid);
  if (!p) return;
  const newName = prompt('Αλλαγη ονοματος προιοντος:\n(Το ιστορικο ΔΕΝ χανεται)', p.name);
  if (!newName || newName.trim() === p.name) return;
  p.name = newName.trim();
  autoSave();
  renderCatalog(document.getElementById('cat-search')?.value || '');
  showToast('Ονομα αλλαχθηκε!');
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
  if (historyMode) {
    // Λειτουργια ιστορικου
    catalogSelected.forEach(pid => {
      const p = getProd(pid);
      if (!p) return;
      const cat = getCatOfProd(pid);
      if (!cat) return;
      if (!cur.history) cur.history = {};
      if (!cur.history[cat]) cur.history[cat] = {};
      cur.history[cat][pid] = 1;
    });
    const n = catalogSelected.size;
    catalogSelected.clear();
    autoSave();
    renderCatalog(document.getElementById('cat-search').value.toLowerCase().trim());
    showToast(`✓ ${n} προιοντα → ιστορικο`);
  } else {
    catalogSelected.forEach(pid => {
      const p = getProd(pid);
      if (!p) return;
      // Ατσεκαριστο, qty=0 — ο χρηστης επιλεγει μονος του
      if (!orderState[pid]) orderState[pid] = { on: false, qty: 0, unit: p.unit };
    });
    catalogSelected.clear();
    renderOrder();
    show('s-order');
  }
}

// ============================================================
// CUSTOM ΠΡΟΪΟΝ — ΠΡΟΣΘΗΚΗ ΣΤΟ ΚΑΤΑΛΟΓΟ
// ============================================================

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
        <i class="ti ti-pencil" style="color:var(--green)"></i> Επεξεργασια προιοντος
      </div>
      <div class="field-label">Ονομα <span style="color:#e00">*</span></div>
      <input type="text" class="field-input" id="edit-name" value="${p.name}">
      <div class="field-label">Αργκο / αναζητηση</div>
      <input type="text" class="field-input" id="edit-slang" value="${p.slang}">
      <div class="field-label">Προμηθευτης</div>
      <input type="text" class="field-input" id="edit-supplier" value="${p.supplier||''}">
      <div class="field-label">Κατηγορια</div>
      <select class="field-input" id="edit-cat">${catOpts}</select>
      <div class="field-label">Μοναδα</div>
      <div style="display:flex;gap:0;border-radius:8px;overflow:hidden;border:1px solid #ddd" id="edit-unit-seg">${unitBtns}</div>
      <input type="hidden" id="edit-unit-val" value="${p.unit}">
      <div class="modal-acts" style="margin-top:20px">
        <button onclick="confirmDeleteProd('${pid}')" style="padding:11px 14px;border-radius:var(--radius);font-size:14px;cursor:pointer;border:none;background:#FEE2E2;color:#B91C1C">
          <i class="ti ti-trash"></i>
        </button>
        <button class="btn-cancel" onclick="document.getElementById('edit-modal').remove()">Ακυρωση</button>
        <button onclick="saveEditProd('${pid}','${cat}')" style="flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#1D9E75;color:#fff">
          <i class="ti ti-check"></i> Αποθηκευση
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
  if (!name) { showToast('Το ονομα ειναι υποχρεωτικο', 'error'); return; }

  // Αν αλλαξε κατηγορια, μετακινηση
  if (newCat !== oldCat) {
    window.PRODUCTS[oldCat] = (window.PRODUCTS[oldCat] || []).filter(p => p.id !== pid);
    if (!window.PRODUCTS[newCat]) window.PRODUCTS[newCat] = [];
    window.PRODUCTS[newCat].push({ id: pid, name, slang: slang || name.toLowerCase(), unit, supplier });
  } else {
    const p = getProd(pid);
    if (p) { p.name = name; p.slang = slang || name.toLowerCase(); p.unit = unit; p.supplier = supplier; }
  }
  // Ενημερωση unit στο orderState αν υπαρχει
  if (orderState[pid]) orderState[pid].unit = unit;

  autoSave();
  document.getElementById('edit-modal').remove();
  renderCatalog('');
  renderOrder();
  showToast('Αποθηκευτηκε!');
}

function confirmDeleteProd(pid) {
  const p = getProd(pid);
  customConfirm(
    `Διαγραφη <strong>${p ? p.name : pid}</strong> απο τον καταλογο;`,
    () => {
      const cat = getCatOfProd(pid);
      window.PRODUCTS[cat] = (window.PRODUCTS[cat] || []).filter(pr => pr.id !== pid);
      delete orderState[pid];
      autoSave();
      const m = document.getElementById('edit-modal');
      if (m) m.remove();
      renderCatalog('');
      renderOrder();
      showToast('Διαγραφηκε');
    }
  );
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
    showToast('Δεν εχεις τσεκαρει κανενα προιον!', 'error'); return;
  }

  // Flush live textarea notes πριν την επιβεβαιωση
  if (cur && cur.pendingItems) {
    cur.pendingItems.forEach((item, i) => {
      const ta = document.getElementById(`pnote-${i}`);
      if (ta) item.note = ta.value;
    });
  }

  // Προειδοποιηση για προιοντα με ποσοτητα αλλα ΟΧΙ τσεκαρισμενα
  const hasQtyNotChecked = Object.entries(orderState).filter(([, s]) => !s.on && s.qty > 0);
  if (hasQtyNotChecked.length) {
    const names = hasQtyNotChecked.map(([pid]) => getProd(pid)?.name || pid).slice(0,3).map(n => `• ${n}`).join('<br>');
    const more = hasQtyNotChecked.length > 3 ? `<br>...και ${hasQtyNotChecked.length - 3} ακομη` : '';
    customConfirm(
      `⚠️ <strong>${hasQtyNotChecked.length} προιον(τα)</strong> εχουν ποσοτητα αλλα ΔΕΝ ειναι τσεκαρισμενα:<br><br>${names}${more}<br><br>Συνεχεια χωρις αυτα;`,
      () => _goSummaryProceed(),
      'Συνεχεια', '#D97706'
    );
    return;
  }
  _goSummaryProceed();
}
function _goSummaryProceed() {
  const ordered = Object.entries(orderState).filter(([, s]) => s.on);
  // Ελεγχος για μηδενικες ποσοτητες
  const zeroQty = ordered.filter(([, s]) => !s.qty || s.qty <= 0);
  if (zeroQty.length) {
    const names = zeroQty.map(([pid]) => getProd(pid)?.name || pid).slice(0,3).join(', ');
    showToast(`Ποσοτητα 0 σε: ${names}${zeroQty.length > 3 ? '...' : ''}`, 'error');
    // Highlight τα προιοντα με 0
    zeroQty.forEach(([pid]) => {
      const el = document.getElementById(`qty-${pid}`);
      if (el) {
        el.style.color = '#DC2626';
        el.style.fontWeight = '800';
        setTimeout(() => { el.style.color = ''; el.style.fontWeight = ''; }, 3000);
      }
    });
    return;
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
    html += `<div class="sum-zone" style="border-color:#EF9F27"><div class="sum-zone-hdr qua"><i class="ti ti-clock" aria-hidden="true"></i> Καραντινα</div><div class="sum-body">`;
    quarantine.forEach(p => {
      html += `<div class="sum-line"><span>${p.name} (${p.cat})</span><span>${p.qty} ${p.unit}</span></div>`;
    });
    html += '</div></div>';
  }

  if (cur && cur.pendingItems && cur.pendingItems.length) {
    html += `<div class="sum-zone" style="border-color:#FCD34D"><div class="sum-zone-hdr" style="background:#FFFBEB;border-bottom:0.5px solid #FCD34D"><i class="ti ti-clock" style="color:#D97706"></i> <span style="color:#92400E">Εκκρεμοτητες (αναμενουν επιβεβαιωση)</span></div><div class="sum-body">`;
    cur.pendingItems.forEach(item => {
      if (item.type === 'text') {
        html += `<div class="sum-line"><span>${item.text}</span><span>—</span></div>`;
      } else {
        html += `<div class="sum-line"><span>${item.name}${item.note ? `<br><small style="color:#888">${item.note}</small>` : ''}</span><span>${item.qty || 1} ${item.unit || ''}</span></div>`;
      }
    });
    html += '</div></div>';
  }

  const notesVal = document.getElementById('order-notes') ? document.getElementById('order-notes').value.trim() : '';
  if (notesVal) {
    html += `<div class="sum-zone" style="border-color:#94a3b8"><div class="sum-zone-hdr" style="background:#f1f5f9;border-bottom:0.5px solid #cbd5e1"><i class="ti ti-notes" style="color:#64748b"></i> <span style="color:#475569">Σημειωσεις</span></div><div class="sum-body"><div style="font-size:13px;color:#333;white-space:pre-wrap;padding:4px 0">${notesVal}</div></div></div>`;
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
    txt += '=== ΚΑΡΑΝΤΙΝΑ (αναμενει επιβεβαιωση) ===\n';
    quarantine.forEach(p => { txt += `• ${p.name}: ${p.qty} ${p.unit}\n`; });
  }
  const notesVal = (document.getElementById('order-notes') ? document.getElementById('order-notes').value.trim() : '');
  if (cur && cur.pendingItems && cur.pendingItems.length) {
    txt += '=== ΕΚΚΡΕΜΟΤΗΤΕΣ ===\n';
    cur.pendingItems.forEach(item => {
      if (item.type === 'text') {
        txt += `• ${item.text}\n`;
      } else {
        txt += `• ${item.name}: ${item.qty || 1} ${item.unit || ''}`;
        if (item.note) txt += ` — ${item.note}`;
        txt += '\n';
      }
    });
    txt += '\n';
  }
  if (notesVal) {
    txt += '=== ΣΗΜΕΙΩΣΕΙΣ ===\n' + notesVal + '\n';
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
        // Καθαρισμος orderState και σημειωσεων μετα αποστολη
        orderState = {};
        quarantine = [];
        const notesEl = document.getElementById('order-notes');
        if (notesEl) notesEl.value = '';
        saveSession();
        renderOrder();
      }
      showToast('Αντιγραφηκε! ✓');
    })
    .catch(() => showToast('Σφαλμα αντιγραφης', 'error'));
}

// ============================================================
// ΜΙΚΡΟΦΩΝΟ
// ============================================================

function toggleMic() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Δοκιμασε απο Chrome!', 'error'); return;
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
  document.getElementById('voice-hint').textContent = 'Μιλας...';
}

const NUMS = {
  'ενα':1,'μια':1,'δυο':2,'δυο':2,'τρια':3,'τρια':3,'τεσσερα':4,'τεσσερα':4,
  'πεντε':5,'πεντε':5,'εξι':6,'εξι':6,'επτα':7,'εφτα':7,'οκτω':8,'οχτω':8,
  'εννεα':9,'εννια':9,'δεκα':10,'δεκα':10
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
  // Καθαρισμος φορμας
  ['nc-name','nc-shop','nc-city','nc-tel','nc-mobile','nc-address'].forEach(id => {
    document.getElementById(id).value = '';
  });
  populateRouteSelect('nc-route');
  checkNcReady();
  show('s-newclient');
}

function populateRouteSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Επιλεξε δρομολογιο...</option>';
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
  if (!name) { showToast('Συμπληρωσε τουλαχιστον το ονομα', 'error'); return; }
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
  showToast(`${name} προστεθηκε!`);
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
      <div style="font-size:17px;font-weight:700;margin-bottom:20px">
        <i class="ti ti-user-edit" style="color:var(--green)"></i> Επεξεργασια πελατη
      </div>
      <div class="field-label">Ονομα / Επιθετο <span style="color:#e00">*</span></div>
      <input type="text" class="field-input" id="ec-name" value="${c.name || ''}">
      <div class="field-label">Επωνυμια καταστηματος</div>
      <input type="text" class="field-input" id="ec-shop" value="${c.shop || ''}">
      <div class="field-label">Πολη / Περιοχη</div>
      <input type="text" class="field-input" id="ec-city" value="${c.city || ''}">
      <div class="field-label">Δρομολογιο</div>
      <select class="field-input" id="ec-route">
        <option value="">— Χωρις δρομολογιο —</option>
        ${routeOpts}
      </select>
      <div class="field-label">Σταθερο τηλεφωνο</div>
      <input type="tel" class="field-input" id="ec-tel" value="${c.tel || ''}">
      <div class="field-label">Κινητο</div>
      <input type="tel" class="field-input" id="ec-mobile" value="${c.mobile || ''}">
      <div class="field-label">Διευθυνση</div>
      <input type="text" class="field-input" id="ec-address" value="${c.address || ''}">
      <button onclick="document.getElementById('edit-client-modal').remove()"
        style="width:100%;padding:13px;border-radius:var(--radius);font-size:15px;font-weight:700;cursor:pointer;border:none;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:24px">
        <i class="ti ti-arrow-left"></i> Πισω
      </button>
      <button onclick="saveEditClient('${cid}')"
        style="width:100%;padding:13px;border-radius:var(--radius);font-size:15px;font-weight:700;cursor:pointer;border:none;background:#0369A1;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px">
        <i class="ti ti-check"></i> Αποθηκευση
      </button>
      <button onclick="openHistoryMode('${cid}')"
        style="width:100%;margin-top:8px;padding:12px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:1px dashed #1D9E75;background:transparent;color:#1D9E75;display:flex;align-items:center;justify-content:center;gap:6px">
        <i class="ti ti-history"></i> Προσθηκη στο ιστορικο
      </button>
      <button onclick="openClearHistoryModal('${cid}')"
        style="width:100%;margin-top:8px;padding:12px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:1px dashed #DC2626;background:transparent;color:#DC2626;display:flex;align-items:center;justify-content:center;gap:6px">
        <i class="ti ti-trash"></i> Αφαιρεση απο ιστορικο
      </button>
      <button onclick="deleteClient('${cid}')"
        style="width:100%;margin-top:16px;padding:13px;border-radius:var(--radius);font-size:15px;font-weight:800;cursor:pointer;border:none;background:#DC2626;color:#000;display:flex;align-items:center;justify-content:center;gap:6px">
        <i class="ti ti-trash"></i> Διαγραφη Πελατη
      </button>
    </div>`;
  document.body.appendChild(modal);
}

function saveEditClient(cid) {
  const name = document.getElementById('ec-name').value.trim();
  if (!name) { showToast('Το ονομα ειναι υποχρεωτικο', 'error'); return; }
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
  showToast('Αποθηκευτηκε!');
}


// ============================================================
// CUSTOM CONFIRM MODAL (χωρις GitHub mention)
// ============================================================
function customConfirm(msg, onYes, yesLabel='Διαγραφη', yesBg='#DC2626') {
  const old = document.getElementById('custom-confirm-modal');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'custom-confirm-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
  m.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:320px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
      <div style="font-size:15px;color:#222;margin-bottom:24px;line-height:1.5">${msg}</div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('custom-confirm-modal').remove()"
          style="flex:1;padding:12px;border-radius:10px;border:1px solid #ddd;background:#f5f5f5;color:#444;font-size:14px;font-weight:600;cursor:pointer">
          Ακυρωση
        </button>
        <button id="custom-confirm-yes"
          style="flex:1;padding:12px;border-radius:10px;border:none;background:${yesBg};color:#fff;font-size:14px;font-weight:600;cursor:pointer">
          ${yesLabel}
        </button>
      </div>
    </div>`;
  document.body.appendChild(m);
  document.getElementById('custom-confirm-yes').onclick = () => {
    m.remove();
    onYes();
  };
}

function deleteClient(cid) {
  const c = window.CLIENTS.find(cl => cl.id === cid);
  const name = c ? c.name : '';
  customConfirm(
    `Διαγραφη πελατη <strong>${name}</strong>;<br><br>Θα διαγραφουν και ολα τα δεδομενα του.`,
    () => {
      window.CLIENTS = window.CLIENTS.filter(cl => cl.id !== cid);
      delete pendingOrders[cid];
      autoSave();
      saveSession();
      const m = document.getElementById('edit-client-modal');
      if (m) m.remove();
      filterClients('');
      showToast('Ο πελατης διαγραφηκε');
    }
  );
}

function openClearHistoryModal(cid) {
  const c = window.CLIENTS.find(cl => cl.id === cid);
  if (!c) return;
  const m = document.getElementById('edit-client-modal');
  if (m) m.remove();

  const allItems = [];
  Object.entries(c.history || {}).forEach(([cat, items]) => {
    Object.entries(items).forEach(([pid, qty]) => {
      const p = getProd(pid);
      if (p) allItems.push({ pid, cat, name: p.name, qty });
    });
  });

  if (!allItems.length) { showToast('Δεν υπαρχει ιστορικο για αυτον τον πελατη'); return; }

  let itemsHTML = allItems.map(item =>
    `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:0.5px solid #eee">
      <div style="flex:1;font-size:13px">${item.name} <span style="font-size:11px;color:#888">(${item.cat})</span></div>
      <button onclick="removeOneFromHistory('${cid}','${item.pid}',this)"
        style="border:none;background:#FEE2E2;color:#B91C1C;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer">
        <i class="ti ti-trash" style="font-size:12px"></i> Αφαιρεση
      </button>
    </div>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'clear-history-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end';
  modal.innerHTML = `
    <div style="background:#fff;width:100%;border-radius:16px 16px 0 0;padding:20px;max-height:85vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#1a1a1a">
        <i class="ti ti-trash" style="color:#DC2626"></i> Ιστορικο: ${c.name}
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:16px">Παταξε "Αφαιρεση" για καθε προιον που θελεις να αφαιρεσεις. Απαιτειται επιβεβαιωση.</div>
      <div id="history-items-list">${itemsHTML}</div>
      <div style="margin-top:16px;display:flex;gap:8px">
        <button onclick="document.getElementById('clear-history-modal').remove()"
          style="flex:1;padding:11px;border-radius:var(--radius);font-size:14px;cursor:pointer;border:1px solid #ddd;background:#fff">
          Κλεισιμο
        </button>
        <button onclick="clearAllHistory('${cid}')"
          style="flex:1;padding:11px;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;border:none;background:#DC2626;color:#fff">
          <i class="ti ti-trash"></i> Διαγραφη ΟΛΩΝ
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function removeOneFromHistory(cid, pid, btn) {
  customConfirm(
    'Αφαιρεση αυτου του προιοντος απο το ιστορικο;',
    () => {
      const c = window.CLIENTS.find(cl => cl.id === cid);
      if (!c) return;
      for (const cat of Object.keys(c.history || {})) {
        if (c.history[cat] && c.history[cat][pid] !== undefined) {
          delete c.history[cat][pid];
          if (Object.keys(c.history[cat]).length === 0) delete c.history[cat];
          break;
        }
      }
      autoSave();
      const row = btn.closest('div[style*="border-bottom"]');
      if (row) row.remove();
      showToast('Αφαιρεθηκε απο το ιστορικο');
    },
    'Αφαιρεση', '#DC2626'
  );
}

function clearAllHistory(cid) {
  customConfirm(
    'Διαγραφη <strong>ΟΛΟΥ</strong> του ιστορικου για αυτον τον πελατη;<br><br>Αυτη η ενεργεια δεν αναιρειται!',
    () => {
      const c = window.CLIENTS.find(cl => cl.id === cid);
      if (!c) return;
      c.history = {};
      autoSave();
      const m = document.getElementById('clear-history-modal');
      if (m) m.remove();
      showToast('Ιστορικο διαγραφηκε');
    },
    'Διαγραφη ΟΛΩΝ', '#DC2626'
  );
}

function openHistoryMode(cid) {
  // Κλεινουμε το modal αν ειναι ανοιχτο
  const m = document.getElementById('edit-client-modal');
  if (m) m.remove();

  // Φορτωνουμε τον πελατη αν δεν ειναι ηδη επιλεγμενος
  if (!cur || cur.id !== cid) {
    cur = window.CLIENTS.find(c => c.id === cid);
    orderState = {};
    quarantine = [];
  }
  if (!cur) return;

  // Αποθηκευση scroll και clientId για επιστροφη μετα
  sessionStorage.setItem('history_return_cid', cid);
  sessionStorage.setItem('history_return_scroll', window.scrollY);

  historyMode = true;

  // Σβηνουμε το session ΠΡΙΝ το show() ωστε να μην αποθηκευτει λαθος οθονη
  try { localStorage.removeItem('orderapp_session'); } catch(e) {}

  // Εμφανιση κουμπιου "Τελος" και αλλαγη "Ακυρωση" σε s-newprod
  const doneBtn = document.getElementById('history-done-btn');
  if (doneBtn) doneBtn.style.display = 'block';
  const cancelBtn = document.getElementById('btn-newprod-cancel');
  if (cancelBtn) { cancelBtn.style.display = 'none'; }

  // Banner ιστορικου (κρυφο πλεον — αντικαταστάθηκε απο το μεγαλο κουμπι)
  const banner = document.getElementById('history-mode-banner');
  if (banner) banner.style.display = 'none';

  // Πηγαινουμε στο νεο προιον (live search) για γρηγορη προσθηκη
  show('s-newprod', false); // false = μην αποθηκευσεις session
  setTimeout(() => {
    const inp = document.getElementById('np-search');
    if (inp) inp.focus();
  }, 200);
}

function exitHistoryMode() {
  historyMode = false;
  // Κρυψιμο κουμπιου "Τελος" και επαναφορα "Ακυρωση"
  const doneBtn = document.getElementById('history-done-btn');
  if (doneBtn) doneBtn.style.display = 'none';
  const cancelBtn = document.getElementById('btn-newprod-cancel');
  if (cancelBtn) cancelBtn.style.display = '';
  const banner = document.getElementById('history-mode-banner');
  if (banner) banner.style.display = 'none';
  // Καθαρισμος
  cur = null;
  orderState = {};
  quarantine = [];
  try { localStorage.removeItem('orderapp_session'); } catch(e) {}

  // Επιστροφη στη λιστα με scroll στον σωστο πελατη
  const returnCid = sessionStorage.getItem('history_return_cid');
  const returnScroll = parseInt(sessionStorage.getItem('history_return_scroll') || '0');
  sessionStorage.removeItem('history_return_cid');
  sessionStorage.removeItem('history_return_scroll');
  console.log('[exitHistory] returnCid:', returnCid, 'scroll:', returnScroll);

  filterClients('');
  show('s-clients', false);

  // Scroll στο σωστο σημειο — περιμενουμε να χτιστει το DOM
  setTimeout(() => {
    if (returnCid) {
      const card = document.getElementById('card-' + returnCid);
      if (card) {
        card.scrollIntoView({ block: 'center' });
        card.style.outline = '2px solid var(--green)';
        setTimeout(() => { card.style.outline = ''; }, 1500);
      }
    }
  }, 200);
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
  if (!label || !key) { showToast('Συμπληρωσε και τα δυο πεδια', 'error'); return; }
  if (ROUTES.find(r => r.key === key)) { showToast('Αυτος ο κωδικος υπαρχει ηδη', 'error'); return; }
  ROUTES.push({ key, label, cls: key });
  closeRouteModal();
  populateRouteSelect('nc-route');
  document.getElementById('nc-route').value = key;
  checkNcReady();
  showToast(`Δρομολογιο "${label}" προστεθηκε!`);
}

// ============================================================
// ΟΥΡΑ ΕΚΤΥΠΩΣΗΣ
// ============================================================

function getPrintQueue() {
  try { return JSON.parse(localStorage.getItem('orderapp_print_queue') || '[]'); }
  catch(e) { return []; }
}

function savePrintQueue(q) {
  localStorage.setItem('orderapp_print_queue', JSON.stringify(q));
}

function updatePrintBanner() {
  const q = getPrintQueue();
  const banner = document.getElementById('print-queue-banner');
  const label  = document.getElementById('print-queue-label');
  if (!banner) return;
  if (q.length > 0) {
    banner.style.display = 'block';
    label.textContent = q.length + ' Παραγγελ' + (q.length === 1 ? 'ια' : 'ιες') + ' για Εκτυπωση';
  } else {
    banner.style.display = 'none';
  }
}

function saveForPrint() {
  const ordered = Object.entries(orderState).filter(([, s]) => s.on);
  if (!ordered.length && !quarantine.length) {
    showToast('Δεν εχεις τσεκαρει κανενα προιον!', 'error'); return;
  }

  // Flush live textarea values πριν το snapshot (αν ο χρηστης δεν εχει κανει blur)
  if (cur && cur.pendingItems) {
    cur.pendingItems.forEach((item, i) => {
      const ta = document.getElementById(`pnote-${i}`);
      if (ta) item.note = ta.value;
    });
  }

  const byZC = buildOrderByZone();
  const notesForSnap = document.getElementById('order-notes') ? document.getElementById('order-notes').value.trim() : '';
  const snapshot = {
    clientId: cur.id,
    clientName: cur.name,
    shop: cur.shop,
    routeLabel: cur.routeLabel,
    date: new Date().toLocaleDateString('el-GR'),
    time: new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }),
    zones: {},
    pendingItems: cur.pendingItems ? JSON.parse(JSON.stringify(cur.pendingItems)) : [],
    notes: notesForSnap
  };
  Object.entries(ZONES).forEach(([zk, z]) => {
    if (!byZC[zk]) return;
    snapshot.zones[zk] = { label: z.label, cats: {} };
    Object.entries(byZC[zk]).forEach(([cat, items]) => {
      snapshot.zones[zk].cats[cat] = items.map(({ p, st }) => ({
        name: p.name, qty: st.qty, unit: st.unit
      }));
    });
  });

  const q = getPrintQueue();
  const existingIdx = q.findIndex(o => o.clientId === cur.id);
  if (existingIdx !== -1) {
    q[existingIdx] = snapshot; // αντικατασταση αντι για διπλη εγγραφη
  } else {
    q.push(snapshot);
  }
  savePrintQueue(q);

  // Ενημερωση ιστορικου
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
    orderState = {};
    quarantine = [];
    const notesEl = document.getElementById('order-notes');
    if (notesEl) notesEl.value = '';
    saveSession();
    renderOrder();
  }

  updatePrintBanner();
  filterClients('');
  showToast(existingIdx !== -1 ? 'Η παραγγελια ενημερωθηκε στην ουρα ✓' : 'Αποθηκευτηκε για εκτυπωση! ✓');
  show('s-clients');
}

function buildCatTotalsText(items) {
  const totals = {};
  items.forEach(item => {
    if (!totals[item.unit]) totals[item.unit] = 0;
    totals[item.unit] += item.qty;
  });
  return Object.entries(totals).map(([u, q]) => `${q} ${u}`).join(' + ');
}

function openPrintPreview() {
  const q = getPrintQueue();
  if (!q.length) { showToast('Δεν υπαρχουν παραγγελιες', 'error'); return; }

  let cols = q.map(order => {
    let html = `<div class="print-col">
      <div class="print-client">${order.clientName}</div>
      <div class="print-shop">${order.shop} — ${order.routeLabel}</div>`;
    Object.entries(order.zones).forEach(([zk, zone]) => {
      const isSyn = zk === 'syn';
      const isApo = zk === 'apo';
      const zLabel = zk === 'kty' ? 'ΚΑΤΑΨΥΞΗ' : zone.label;
      const zoneStyle = isSyn ? 'style="background:#b0b0b0;color:#000;font-weight:700;"'
                      : isApo ? 'style="background:#686868;color:#fff;font-weight:700;"'
                      : '';
      const itemStyle = '';
      html += `<div class="print-zone" ${zoneStyle}>${zLabel}</div>`;
      Object.entries(zone.cats).forEach(([cat, items]) => {
        const total = buildCatTotalsText(items);
        html += `<div class="print-cat" ${itemStyle}><span>${cat}</span><span class="print-cat-total">${total}</span></div>`;
        items.forEach(item => {
          html += `<div class="print-item" ${itemStyle}><span class="print-qty">${item.qty} ${item.unit}</span> ${item.name}</div>`;
        });
      });
    });
    if (order.pendingItems && order.pendingItems.length) {
      html += `<div class="print-zone pend-zone">ΕΚΚΡΕΜΟΤΗΤΕΣ</div>`;
      order.pendingItems.forEach(item => {
        if (item.type === 'text') {
          html += `<div class="print-item"><span class="print-qty">—</span> ${item.text}</div>`;
        } else {
          html += `<div class="print-item"><span class="print-qty">${item.qty || 1} ${item.unit || ''}</span> ${item.name}${item.note ? ' <em style="color:#666;font-size:9px">(' + item.note + ')</em>' : ''}</div>`;
        }
      });
    }
    if (order.notes) {
      html += `<div class="print-zone" style="background:#e8e8e8;color:#333">ΣΗΜΕΙΩΣΕΙΣ</div>`;
      html += `<div class="print-item" style="font-style:italic;color:#444;white-space:pre-wrap">${order.notes}</div>`;
    }
    html += `</div>`;
    return html;
  }).join('');

  const numCols = Math.min(q.length, 4);

  window._printHTML = `<!DOCTYPE html><html lang="el"><head>
    <meta charset="UTF-8">
    <title>Παραγγελιες</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      body { font-family: Arial, sans-serif; font-size: 12px; }
      .print-grid { columns:${numCols}; column-gap:8px; }
      .print-col { break-inside:avoid; border:1px solid #bbb; border-radius:3px; padding:5px; margin-bottom:8px; display:inline-block; width:100%; overflow:hidden; }
      .print-client { font-size:13px; font-weight:700; border-bottom:1.5px solid #000; padding-bottom:2px; margin-bottom:3px; }
      .print-shop { font-size:9px; color:#555; margin-bottom:4px; }
      .print-zone { font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 5px; margin:4px -5px 2px -5px; letter-spacing:0.5px; background:#ddd; color:#000; }
      .syn-zone { background:#999; color:#000; }
      .syn-bg { background:#d8d8d8; }
      .pend-zone { background:#bbb; color:#000; }
      .print-cat { font-size:10px; font-weight:600; color:#000; margin:2px 0 1px 0; border-bottom:0.5px solid #ccc; display:flex; justify-content:space-between; gap:4px; padding:0 2px; }
      .print-cat-total { font-weight:700; color:#000; white-space:nowrap; }
      .print-item { font-size:11px; padding:1px 0 1px 6px; display:flex; gap:4px; }
      .print-qty { font-weight:700; white-space:nowrap; min-width:28px; }
      @page { size:A4; margin:15mm 8mm 8mm 8mm; }
      @page { margin-top: 15mm; }
      /* Κρυβει browser header/footer (Chrome/Edge/Firefox) */
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @media print {
        @page { margin: 15mm 8mm 8mm 8mm; }
        head title { display: none; }
      }
    </style>
  </head><body>
    <div style="font-size:9px;color:#999;text-align:right;margin-bottom:4px;padding-bottom:4px;border-bottom:0.5px solid #ddd">KFF Food Service · Παραγγελιες ${new Date().toLocaleDateString('el-GR')}</div>
    <div class="print-grid">${cols}</div>
  </body></html>`;

  const previewHTML = `
    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:11px;color:#92400E;display:flex;align-items:flex-start;gap:6px">
      <i class="ti ti-info-circle" style="flex-shrink:0;margin-top:1px"></i>
      <span>Στο Chrome: <strong>Περισσοτερες ρυθμισεις → απενεργοποιηση "Κεφαλιδες και υποσελιδα"</strong> για να μην εμφανιζονται η ωρα και το URL</span>
    </div>
    <div style="background:#f5f5f5;border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px;color:#555;text-align:center">
      <i class="ti ti-info-circle"></i> Προεπισκοπηση — πατα "Εκτυπωση/PDF" για αποθηκευση
    </div>
    <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;overflow-x:auto">
      <div class="print-grid">${cols}</div>
    </div>`;

  const el = document.getElementById('s-print-content');
  if (el) el.innerHTML = previewHTML;
  show('s-print');
}
function doPrint() {
  if (!window._printHTML) { showToast('Δεν υπαρχει προεπισκοπηση', 'error'); return; }
  let iframe = document.getElementById('print-iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(window._printHTML);
  doc.close();
  setTimeout(() => iframe.contentWindow.print(), 300);
}

function clearPrintQueue() {
  customConfirm(
    'Διαγραφη ολων των παραγγελιων απο την ουρα εκτυπωσης;<br><br>Κανε αυτο <strong>ΜΟΝΟ</strong> αφου εχεις εκτυπωσει / στειλει!',
    () => {
      savePrintQueue([]);
      updatePrintBanner();
      show('s-clients');
      showToast('Ουρα εκτυπωσης καθαριστηκε');
    },
    'Καθαρισμος', '#DC2626'
  );
}



let catalogSelected = new Set(); // Επιλεγμενα στον καταλογο

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  // Φορτωση pendingOrders απο session
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
  updatePrintBanner();
});
