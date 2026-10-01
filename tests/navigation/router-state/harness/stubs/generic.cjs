'use strict';
function deepStub(name) {
  const fn = function () { return null; };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      if (prop === '$$typeof' || prop === 'displayName' || prop === 'prototype') return undefined;
      return deepStub(name + '.' + String(prop));
    },
    apply() { return null; },
  });
}
module.exports = deepStub('stub');
