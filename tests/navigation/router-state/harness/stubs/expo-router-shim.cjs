'use strict';
// What app code under lib/ sees as 'expo-router' inside the harness: the REAL
// imperative router and container-ref accessor from the installed build, without
// pulling in expo-router's whole index (Link, native tabs, views) which cannot
// load in node.
const path = require('node:path');
const ER = path.resolve(__dirname, '../../../../../node_modules/expo-router/build') + '/';
exports.router = require(ER + 'imperative-api.js').router;
exports.useNavigationContainerRef = require(ER + 'hooks.js').useNavigationContainerRef;
