'use strict';
// Headless stand-in for @react-navigation/native-stack's NativeStackView.
// The real view (NativeStackView.native.js:364) renders EVERY route in state.routes
// plus preloadedRoutes; this does the same, without native views.
const React = require('react');
exports.NativeStackView = function NativeStackView({ state, descriptors, describe }) {
  const pre = state.preloadedRoutes || [];
  return state.routes.concat(pre).map((route) => {
    const d = descriptors[route.key] || describe(route, true);
    return React.createElement(React.Fragment, { key: route.key }, d.render());
  });
};
