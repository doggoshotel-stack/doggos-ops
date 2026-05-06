/**
 * localStorage wrapper that mimics the Claude artifact `window.storage` API.
 * The `shared` parameter is accepted but ignored — config is per-device.
 * If you ever want shared config across devices, swap this for a Supabase
 * (or equivalent) client and keep the same surface.
 */
export const storage = {
  async get(key /*, shared */) {
    const v = localStorage.getItem(key);
    return v != null ? { key, value: v, shared: false } : null;
  },
  async set(key, value /*, shared */) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
  async delete(key /*, shared */) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix = '' /*, shared */) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    return { keys, prefix, shared: false };
  },
};
