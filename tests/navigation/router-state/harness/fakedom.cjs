// Minimal DOM so react-dom/client can mount a tree that renders NO host elements.
'use strict';
class Node {
  constructor(type, name, doc) { this.nodeType = type; this.nodeName = name; this.tagName = name; this.ownerDocument = doc; this.childNodes = []; this.parentNode = null; this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.style = {}; this.attributes = {}; }
  addEventListener() {} removeEventListener() {}
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); c.parentNode = null; return c; }
  insertBefore(c, b) { c.parentNode = this; const i = this.childNodes.indexOf(b); if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; }
  setAttribute(k, v) { this.attributes[k] = v; } removeAttribute(k) { delete this.attributes[k]; }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { if (!this.parentNode) return null; const s = this.parentNode.childNodes; return s[s.indexOf(this) + 1] || null; }
  set textContent(v) { this.childNodes = []; this._text = v; } get textContent() { return this._text || ''; }
  compareDocumentPosition() { return 0; }
  focus() {}
}
class HTMLIFrameElement extends Node {}
const doc = new Node(9, '#document', null);
doc.ownerDocument = null;
doc.createElement = (t) => new Node(1, String(t).toUpperCase(), doc);
doc.createElementNS = (_ns, t) => new Node(1, String(t).toUpperCase(), doc);
doc.createTextNode = (t) => { const n = new Node(3, '#text', doc); n.nodeValue = t; return n; };
doc.createComment = (t) => { const n = new Node(8, '#comment', doc); n.nodeValue = t; return n; };
doc.documentElement = new Node(1, 'HTML', doc); doc.documentElement.parentNode = doc;
doc.body = new Node(1, 'BODY', doc); doc.documentElement.appendChild(doc.body);
doc.activeElement = doc.body;
doc.getSelection = () => null;
const win = { document: doc, HTMLIFrameElement, addEventListener() {}, removeEventListener() {}, getSelection: () => null, event: undefined, navigator: { userAgent: 'node' }, location: { href: 'http://localhost/', protocol: 'http:' } };
doc.defaultView = win;
globalThis.window = win; globalThis.document = doc; globalThis.HTMLIFrameElement = HTMLIFrameElement;
if (!globalThis.navigator) globalThis.navigator = win.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
module.exports = { doc, win, makeContainer() { const c = doc.createElement('div'); doc.body.appendChild(c); return c; } };
