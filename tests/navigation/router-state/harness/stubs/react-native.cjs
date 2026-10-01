'use strict';
// Minimal react-native surface. Only what the routing layer touches.
const noopSub = { remove() {} };
exports.Platform = { OS: 'ios', Version: '26.0', select: (o) => (o.ios !== undefined ? o.ios : o.native !== undefined ? o.native : o.default) };
exports.I18nManager = { getConstants: () => ({ isRTL: false }), isRTL: false };
exports.Linking = { addEventListener: () => noopSub, getInitialURL: async () => null, openURL: async () => {} };
exports.BackHandler = { addEventListener: () => noopSub };
exports.Text = 'Text';
exports.View = 'View';
exports.Pressable = 'Pressable';
exports.StatusBar = () => null;
exports.StyleSheet = { create: (x) => x, absoluteFill: {}, hairlineWidth: 1, flatten: (x) => x };
exports.useColorScheme = () => 'light';
exports.AppState = { addEventListener: () => noopSub, currentState: 'active' };
exports.NativeModules = {};
exports.Animated = {};
exports.Dimensions = { get: () => ({ width: 390, height: 844 }) };
