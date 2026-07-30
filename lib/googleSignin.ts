// Single import seam for the native Google Sign-In SDK.
//
// Everything in the app imports GoogleSignin from here rather than from
// '@react-native-google-signin/google-signin' directly, so the web build can
// swap in lib/googleSignin.web.ts. The upstream package's index re-exports
// GoogleSigninButton, which deep-imports
// 'react-native/Libraries/Utilities/codegenNativeComponent' — that throws
// "__fbBatchedBridgeConfig is not set" in a browser and white-screens the app.
export { GoogleSignin } from '@react-native-google-signin/google-signin';
