'use strict';
// In-memory keychain. A case seeds it (e.g. the AppUpdateGate reload stamp)
// through globalThis.__NAVSIM_SECURE__ before boot.
Object.defineProperty(exports, '__esModule', { value: true });
const M = (globalThis.__NAVSIM_SECURE__ = globalThis.__NAVSIM_SECURE__ || new Map());
exports.getItem = (k) => (M.has(k) ? M.get(k) : null);
exports.setItem = (k, v) => { M.set(k, String(v)); };
exports.deleteItemAsync = async (k) => { M.delete(k); };
exports.getItemAsync = async (k) => (M.has(k) ? M.get(k) : null);
exports.setItemAsync = async (k, v) => { M.set(k, String(v)); };
