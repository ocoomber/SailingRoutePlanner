const DB_NAME = 'coastline-tiles';
const STORE_NAME = 'tiles';
const DB_VERSION = 2;

export class TileCache {
  constructor() {
    this._db = null;
    this._ready = false;
  }

  async open() {
    if (this._ready) return;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        } else {
          e.target.transaction.objectStore(STORE_NAME).clear();
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        this._ready = true;
        resolve();
      };
      req.onerror = (e) => {
        reject(new Error('Failed to open IndexedDB: ' + e.target.error));
      };
    });
  }

  async get(z, x, y) {
    if (!this._ready) await this.open();
    const key = `${z}/${x}/${y}`;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(new Error('IndexedDB read failed'));
    });
  }

  async set(z, x, y, data) {
    if (!this._ready) await this.open();
    const key = `${z}/${x}/${y}`;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = { key, data, cached: Date.now() };
      store.put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('IndexedDB write failed'));
    });
  }

  async has(z, x, y) {
    const val = await this.get(z, x, y);
    return val !== null;
  }

  async keys() {
    if (!this._ready) await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('IndexedDB keys failed'));
    });
  }

  async stats() {
    const allKeys = await this.keys();
    return {
      total: allKeys.length,
      keys: allKeys
    };
  }
}
