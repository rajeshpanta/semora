// Headless stand-in for bottom-tabs' BottomTabView: lazy tabs (default lazy:true),
// focused + already-visited routes stay rendered, like the real view.
import * as React from 'react';
export function BottomTabView({ state, descriptors }) {
  const focusedKey = state.routes[state.index].key;
  const [loaded, setLoaded] = React.useState([focusedKey]);
  if (!loaded.includes(focusedKey)) setLoaded([...loaded, focusedKey]);
  return state.routes.map((r) =>
    loaded.includes(r.key) || r.key === focusedKey
      ? React.createElement(React.Fragment, { key: r.key }, descriptors[r.key].render())
      : null
  );
}
