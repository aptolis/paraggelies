// ============================================================
// ΑΠΟΘΗΚΕΥΣΗ & ΔΙΑΧΕΙΡΙΣΗ ΚΑΤΑΣΤΑΣΗΣ (localStorage)
// ============================================================

const STORAGE_KEYS = {
  PRODUCTS: 'orderapp_products',
  CLIENTS:  'orderapp_clients',
  VERSION:  'orderapp_version',
};

const APP_VERSION = '1.0';

// Φορτωση δεδομενων απο localStorage (η defaults)
function loadData() {
  try {
    const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    const savedClients  = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    window.PRODUCTS = savedProducts ? JSON.parse(savedProducts) : JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    window.CLIENTS  = savedClients  ? JSON.parse(savedClients)  : JSON.parse(JSON.stringify(DEFAULT_CLIENTS));

    // MIGRATION: συγχρονισμος νεων κατηγοριων απο DEFAULT_PRODUCTS
    // Αν λειπουν κατηγοριες (π.χ. ΚΡΟΚΕΤΕΣ/ΠΑΝΑΡΙΣΜΕΝΑ, ΖΥΜΑΡΙΚΑ κ.λπ.) τις προσθετουμε
    Object.entries(DEFAULT_PRODUCTS).forEach(([cat, prods]) => {
      if (!window.PRODUCTS[cat]) {
        window.PRODUCTS[cat] = JSON.parse(JSON.stringify(prods));
      } else {
        // Προσθετουμε νεα προιοντα που λειπουν
        const existingIds = new Set(window.PRODUCTS[cat].map(p => p.id));
        prods.forEach(p => {
          if (!existingIds.has(p.id)) window.PRODUCTS[cat].push(JSON.parse(JSON.stringify(p)));
        });
      }
    });
    // Αφαιρεση παλιων κατηγοριων που δεν υπαρχουν πια
    const validCats = new Set(Object.keys(DEFAULT_PRODUCTS));
    Object.keys(window.PRODUCTS).forEach(cat => {
      if (!validCats.has(cat) && !cat.startsWith('custom')) {
        // Κρατα μονο custom κατηγοριες και τις γνωστες
        // Μετακινε τα custom προιοντα σε ΑΠΟΘΗΚΗ αν η κατηγορια ειναι παλια
      }
    });

    // MIGRATION: συγχρονισμος νεων πελατων απο DEFAULT_CLIENTS
    const existingClientIds = new Set(window.CLIENTS.map(c => c.id));
    DEFAULT_CLIENTS.forEach(dc => {
      if (!existingClientIds.has(dc.id)) {
        window.CLIENTS.push(JSON.parse(JSON.stringify(dc)));
      }
    });
  } catch(e) {
    console.error('Σφαλμα φορτωσης:', e);
    window.PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    window.CLIENTS  = JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
  }
}

// Αποθηκευση στο localStorage
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(window.PRODUCTS));
    localStorage.setItem(STORAGE_KEYS.CLIENTS,  JSON.stringify(window.CLIENTS));
    localStorage.setItem(STORAGE_KEYS.VERSION,  APP_VERSION);
    showToast('Αποθηκευτηκε!', 'success');
  } catch(e) {
    showToast('Σφαλμα αποθηκευσης', 'error');
  }
}

// Auto-save (χωρις toast)
function autoSave() {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(window.PRODUCTS));
    localStorage.setItem(STORAGE_KEYS.CLIENTS,  JSON.stringify(window.CLIENTS));
  } catch(e) { console.error('Auto-save error:', e); }
}

// ============================================================
// BACKUP / RESTORE
// ============================================================

function emailBackup() {
  const data = {
    version: APP_VERSION,
    date: new Date().toISOString(),
    products: window.PRODUCTS,
    clients:  window.CLIENTS,
  };
  const json     = JSON.stringify(data, null, 2);
  const filename = `backup_paraggelies_${new Date().toLocaleDateString('el-GR').replace(/\//g,'-')}.json`;
  const body     = encodeURIComponent(`Backup εφαρμογης Παραγγελιες\nΗμερομηνια: ${new Date().toLocaleString('el-GR')}\n\n(Επισυναψε το αρχειο ${filename} απο τα Downloads)`);
  const subject  = encodeURIComponent(`Backup Παραγγελιες ${new Date().toLocaleDateString('el-GR')}`);

  // Πρωτα κατεβαζει το αρχειο, μετα ανοιγει το email
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  // Μετα απο λιγο ανοιγει το email app με προσυμπληρωμενα στοιχεια
  setTimeout(() => {
    window.location.href = `mailto:tolis.diaf@gmail.com?subject=${subject}&body=${body}`;
    showToast('Ανοιξε το email και επισυναψε το αρχειο!', 'success');
  }, 800);
}

function exportBackup() {
  const data = {
    version: APP_VERSION,
    date: new Date().toISOString(),
    products: window.PRODUCTS,
    clients:  window.CLIENTS,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `backup_paraggelies_${new Date().toLocaleDateString('el-GR').replace(/\//g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup αποθηκευτηκε!', 'success');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.products || !data.clients) throw new Error('Μη εγκυρο αρχειο');
      window.PRODUCTS = data.products;
      window.CLIENTS  = data.clients;
      autoSave();
      showToast('Restore επιτυχες!', 'success');
      setTimeout(() => location.reload(), 1000);
    } catch(err) {
      showToast('Σφαλμα: μη εγκυρο αρχειο backup', 'error');
    }
  };
  reader.readAsText(file);
}

// ============================================================
// ΒΟΗΘΗΤΙΚΕΣ ΣΥΝΑΡΤΗΣΕΙΣ ΔΕΔΟΜΕΝΩΝ
// ============================================================

function getAllProducts() {
  return Object.values(window.PRODUCTS).flat();
}

function getProd(pid) {
  return getAllProducts().find(p => p.id === pid);
}

function getCatOfProd(pid) {
  for (const [cat, prods] of Object.entries(window.PRODUCTS)) {
    if (prods.find(p => p.id === pid)) return cat;
  }
  return '';
}

function searchProducts(query) {
  if (!query || query.length < 2) return [];
  const f = query.toLowerCase().trim();
  return getAllProducts().filter(p =>
    p.name.toLowerCase().includes(f) ||
    p.slang.toLowerCase().includes(f) ||
    (p.supplier && p.supplier.toLowerCase().includes(f))
  );
}

// Toast notification
function showToast(msg, type='success') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 2500);
}
