'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const L = (globalThis.__NAVSIM_URL_LISTENERS__ = globalThis.__NAVSIM_URL_LISTENERS__ || new Set());
exports.createURL = (p) => 'semora://' + (p || '');
exports.getLinkingURL = () => globalThis.__NAVSIM_INITIAL_URL__ || null; // null = launched from the home screen
exports.addEventListener = (_type, cb) => { L.add(cb); return { remove() { L.delete(cb); } }; };
exports.openURL = async () => {};
exports.parse = (u) => ({ path: u });
