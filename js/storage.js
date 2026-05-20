// ============================================================
// ΑΠΟΘΗΚΕΥΣΗ & ΔΙΑΧΕΙΡΙΣΗ ΚΑΤΑΣΤΑΣΗΣ (localStorage)
// ============================================================

const STORAGE_KEYS = {
  PRODUCTS: 'orderapp_products',
  CLIENTS:  'orderapp_clients',
  VERSION:  'orderapp_version',
};

const APP_VERSION = '1.0';

// Φόρτωση δεδομένων από localStorage (ή defaults)
function loadData() {
  try {
    const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    const savedClients  = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    window.PRODUCTS = savedProducts ? JSON.parse(savedProducts) : JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    window.CLIENTS  = savedClients  ? JSON.parse(savedClients)  : JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
  } catch(e) {
    console.error('Σφάλμα φόρτωσης:', e);
    window.PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    window.CLIENTS  = JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
  }
}

// Αποθήκευση στο localStorage
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(window.PRODUCTS));
    localStorage.setItem(STORAGE_KEYS.CLIENTS,  JSON.stringify(window.CLIENTS));
    localStorage.setItem(STORAGE_KEYS.VERSION,  APP_VERSION);
    showToast('Αποθηκεύτηκε!', 'success');
  } catch(e) {
    showToast('Σφάλμα αποθήκευσης', 'error');
  }
}

// Auto-save (χωρίς toast)
function autoSave() {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(window.PRODUCTS));
    localStorage.setItem(STORAGE_KEYS.CLIENTS,  JSON.stringify(window.CLIENTS));
  } catch(e) { console.error('Auto-save error:', e); }
}

// ============================================================
// BACKUP / RESTORE
// ============================================================

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
  showToast('Backup αποθηκεύτηκε!', 'success');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.products || !data.clients) throw new Error('Μη έγκυρο αρχείο');
      window.PRODUCTS = data.products;
      window.CLIENTS  = data.clients;
      autoSave();
      showToast('Restore επιτυχές!', 'success');
      setTimeout(() => location.reload(), 1000);
    } catch(err) {
      showToast('Σφάλμα: μη έγκυρο αρχείο backup', 'error');
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
