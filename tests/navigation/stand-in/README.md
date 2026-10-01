# Stand-in apps (reference only — not the regression gate)

Three small React Native apps written during the 2026-10-01 diagnosis. Each
rebuilds ONE Semora pattern with the same library versions (react-native-screens
4.16.0, @react-navigation/native-stack 7.14.11, bottom-tabs 7.15.9) so a
failure could be reproduced and traced in isolation. They are kept because they
are the only reproductions of two of the defects so far; the gate is the real
app (`../ios`), and a result here is never sufficient on its own.

| Folder | Reproduces | What it showed |
|---|---|---|
| `back-button-workarounds/` | the dead native Back button (header-less tabs at the bottom; a second header-less tabs route) and the JS-only workarounds | Back dead from the 2nd cycle on iOS 27.0 (normal shape) and on iOS 26.5 (duplicate shape). Worked: an invisible header on the tabs route only while it is covered (best), a focus-time toggle of `headerBackVisible`, a JS `headerLeft`. Did not work: `headerBackButtonMenuEnabled:false`, display mode `minimal`, removing or changing `headerBackTitle`, `usePreventRemove`, `headerBackTitleStyle`. |
| `back-then-tab-freeze/` | upstream react-native-screens #4361: native Back (or edge swipe), then another tab within ~0.45 s | Tab content permanently untouchable (the tab bar still works) on iOS 26.5 and 27.0; JS-started pops never froze. |
| `upgrade-sheet-freeze/` | a root-level RN `<Modal>` asked to present while a `presentation:'modal'` screen is up | The sheet never appears; after the modal screen closes, an invisible screen-sized host view blocks every tap, the native Back button included. |

## How they were run

Each app ran inside Expo Go 54.0.6 on a simulator (Expo Go contains
react-native-screens 4.16.0 natively), with Metro serving `App.js` from a
scratch folder whose `node_modules` was a read-only link to this repo's. The
`uit/` folder is the XCUITest driver for that app (generate with
`xcodegen generate --spec uit/project.yml --project <a temp dir>`; set
`STANDIN_OUT` to where screenshots and logs should go).

The `trace` and freeze tests pause for a host-side lldb attach: they write a
marker file under `STANDIN_OUT` and wait up to two or two and a half minutes for the host to
remove it (or to write `<udid>.done`). That watcher is not kept here; without
it the tests wait out the timeout and carry on. For Semora itself the
equivalent is `../ios/tools/native_probe.py`. `upgrade-sheet-freeze/` also has a
`Pills` screen, a copy of the lecture recording pill used to check its tap target.

No `package.json` is kept here on purpose: two of these apps used the same
package name, and duplicate names under the repo would collide in Metro's
module map. Recreate one in a scratch folder (expo 54.0.36, react 19.1.0,
react-native 0.81.5, the navigation packages above) when re-running.

Limits: plain React Navigation rather than expo-router, a Metro dev bundle, and
Expo Go's native build settings — which is exactly why each finding has to be
confirmed in Semora before anything is changed because of it.
