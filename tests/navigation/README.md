# Navigation regression tests

The regression gate for Semora's navigation: the native Back button, returning
to the tabs, sheet screens, and the two freezes found in the 2026-10-01
diagnosis. Everything here is test-only: nothing in this folder is bundled into
the app, and none of it is a runtime-fingerprint input (verified: the iOS
fingerprint is identical with and without this folder).

| ID | What it checks | Where |
|---|---|---|
| NAV-STACK (state) | Every way the app returns to the tabs ends with exactly ONE tab navigator, on the right tab, and keeps the one that was already there | `router-state/run.cjs` (headless, real expo-router) |
| NAV-STACK (inventory) | Every audited call site uses `returnToTabs`; nothing else navigates straight to a tab path from outside the tabs | `router-state/callsites.cjs` |
| NAV-LINK (state) | `app/+native-intent.tsx`: links opened while the app runs or that launch it. A semoraai.com link that is not a share link goes home to the tab navigator already there; share links and `semora://` links are unchanged | `router-state/cases.cjs` LINKS |
| NAV-LINK (native) | The same with a real Universal Link, opened over a pushed screen | `ios/scenarios/site-link.nav` |
| NAV-STACK (native) | The same, measured in the running app: number of screens in the root `UINavigationController` after each write-free flow | `ios/scenarios/stack-flows.nav` |
| NAV-BACK-NORMAL | Open a first-level screen and leave with the native Back button, 10x, with one tab navigator | `ios/scenarios/back-normal.nav` |
| NAV-BACK-DUP | The same after "Done for now" on the syllabus "added" screen (the iOS 26 trigger) | `ios/scenarios/back-after-done-for-now.nav` |
| NAV-TABFREEZE | Back (or edge swipe), then another tab immediately; the tab content must still respond | `ios/scenarios/tab-freeze.nav` |
| NAV-UPSELL | Pro upgrade sheet hit inside a sheet screen, then that screen closed; the app must still respond. Needs a FREE account, skipped otherwise | `ios/scenarios/upsell-freeze.nav` |
| NAV-SHEET | Open a sheet screen (New Task), swipe it away; the app must still respond | `ios/scenarios/sheet-dismiss.nav` |
| SMOKE | The app launches, the runner sees it, the native probe answers | `ios/scenarios/smoke.nav` |

`stand-in/` holds the three reference apps from the diagnosis; they are not
part of the gate (see its README).

"Priority N" in these files refers to the steps of the 2026-10-01 navigation
fix plan: 2 = one way back to the tabs (`lib/tabNavigation.ts`), 3 = a JS
workaround for the iOS 26+ Back button, 4 = the upgrade-sheet freeze, 5 = the
Back-then-tab freeze, 6 = the react-native-screens upgrade.

## Running

### Router state (seconds, no simulator)

```sh
node tests/navigation/router-state/run.cjs                # legacy + helper; exit 1 on a helper failure
node tests/navigation/router-state/run.cjs --mode helper  # the gate
node tests/navigation/router-state/callsites.cjs --strict # exit 1 if a site is unconverted
```

`--mode legacy` replays the raw calls the sites made before `lib/tabNavigation.ts`
and documents the bug: 33 of the 62 cases and controls end with a second tab
navigator, the tabs above another screen, or a second sign-in screen. It is a
record, not a gate. In legacy mode no home handler is registered, so
`+native-intent` returns '/' for a website link exactly as before.

Requirements: Node 22.15 or later (the harness uses `module.registerHooks`) and
the repo's own `node_modules` from `npm ci`. Nothing is installed for the test:
it loads the real expo-router and React Navigation from `node_modules`, plus
`sucrase`, which is there as a dependency of Expo's tooling, and swaps only the
native views for headless stubs (`harness/stubs/`).

### In the app (simulator)

```sh
tests/navigation/ios/tools/run.sh --udid <SIMULATOR UDID> --scenario back-normal
```

Requirements:
- `xcodegen` and Xcode. The runner is a plain XCUITest bundle that drives the
  installed app by bundle id, so any Xcode can build it; the generated project
  and all output go to `$TMPDIR` (override with `NAVGATE_BUILD` / `--out`).
- The simulator booted, with Semora installed and signed in. Scenarios only
  navigate: the driver refuses to tap anything labelled save, create, delete,
  connect, import, sync, buy, restore, sign out, record, send, share or mark.
  Running them as a real account still sends that account's ordinary analytics.
- `lldb` (the native probe attaches briefly to read the root stack and the
  Back button's `userInteractionEnabled`; it changes nothing).

To run changed JavaScript without building Semora, install a Debug simulator
build and point it at a Metro server per simulator:

```sh
npx expo start --port 8099 --no-dev --minify          # in the tree under test
xcrun simctl spawn <UDID> defaults write com.rajeshpanta.syllabussnap RCT_jsLocation -string localhost:8099
xcrun simctl spawn <UDID> defaults write com.rajeshpanta.syllabussnap RCT_enableDev -bool NO
xcrun simctl spawn <UDID> defaults write com.rajeshpanta.syllabussnap RCT_enableMinification -bool YES
```

A Debug native build raises React Native's red error box for any
`console.error` (on a simulator, RN-IAP's "receipt-failed" at every launch);
the driver dismisses it, and the iOS "Apple Account Verification" alert, and
logs each time it does.

A build made with Xcode 27 does not launch on iOS 27 (no UIScene support in
Expo SDK 54); to test iOS 27, use a binary built with Xcode 26.x.

## Expected results

The simulator table below was measured on the 1.15.1 tree, not on this one.
The 1.15.2 router-state numbers follow it.

Measured 2026-10-01 in Semora (Debug 1.14 (58) simulator binary, react-native-screens
4.16.0, built with the iOS 26.5 SDK, running the 1.15.1 JavaScript from Metro in
release mode). "Before" is the code before `lib/tabNavigation.ts`; "after" is with it.

| iOS | Scenario | Before | After |
|---|---|---|---|
| 17.5 | NAV-BACK-NORMAL | 10/10 popped | 10/10 popped |
| 17.5 | NAV-BACK-DUP | root stack 2 (duplicate), 10/10 popped | root stack 1, 10/10 popped |
| 17.5 | NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 | 1 → 1 → 1 → 1 → 1 |
| 18.0 | NAV-BACK-NORMAL | 10/10 popped | 10/10 popped |
| 18.0 | NAV-BACK-DUP | root stack 2 (duplicate), 10/10 popped | root stack 1, 10/10 popped |
| 18.0 | NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 | 1 → 1 → 1 → 1 → 1 |
| 26.0 | NAV-BACK-NORMAL | 10/10 popped | 10/10 popped |
| 26.0 | NAV-BACK-DUP | root stack 2, **Back dead 8/9** (+1 cycle lost to a missed edge swipe) | root stack 1, 10/10 popped |
| 26.0 | NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 | 1 → 1 → 1 → 1 → 1 |
| 26.1 | NAV-BACK-NORMAL | 10/10 popped | 10/10 popped |
| 26.1 | NAV-BACK-DUP | root stack 2, **Back dead 9/10** | root stack 1, 10/10 popped |
| 26.1 | NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 | 1 → 1 → 1 → 1 → 1 |
| 26.5 | NAV-BACK-NORMAL | 10/10 popped | 10/10 popped |
| 26.5 | NAV-BACK-DUP | root stack 2, **Back dead 9/10** | root stack 1, 10/10 popped |
| 26.5 | NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 | 1 → 1 → 1 → 1 → 1 |
| 27.0 | NAV-BACK-NORMAL | **Back dead 9/10** | **Back dead 9/10** |
| 27.0 | NAV-BACK-DUP | root stack 2, **Back dead 9/10** | root stack 1, **Back dead 9/10** |
| 27.0 | NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 | 1 → 1 → 1 → 1 → 1 |
| 18.0, 26.1, 26.5, 27.0 | NAV-SHEET | app responds after dismissal | same |
| 18.0, 26.1, 26.5, 27.0 | NAV-TABFREEZE | Back + tab ~0.4 s later: the pop is undone 4/4 (Back works when tapped again); swipe + tab: content responds 4/4. No freeze at this timing | same |

1.15.2 on a physical iPhone 17 Pro Max, iOS 27.0 (24A437), 2026-10-01: the
1.15.2 (62) release binary with only its JavaScript replaced ("before" = the
1.15.2 code, "after" = with `lib/tabNavigation.ts`), development-signed, OTA
updates off. Back counts are taps measured; a cycle whose recovery swipe did
not register leaves the next cycle without a row and is not counted.

| Scenario | Before | After |
|---|---|---|
| NAV-STACK (native) | 1 → 2 → 3 → 5 → 6 → 8 → 10 | 1 → 1 → 1 → 1 → 1 → 1 → 1 |
| NAV-BACK-NORMAL | Back dead 7 of 8 (the first works) | Back dead 6 of 7 (the first works) |
| NAV-BACK-DUP | root stack 2, Back dead 6 of 7 | root stack 1, Back dead 6 of 7 |
| NAV-LINK (native) | 2 → 1, 3 → 1 | 2 → 1, 3 → 1 |
| NAV-SHEET | app responds after dismissal | same |
| NAV-TABFREEZE | Back + tab ~0.7 s later: content responds 4/4 | same |

On iOS 27 the dead Back button does not need a duplicate: after one native Back
that lands on the tabs, the next first-level screen's Back control is the same
UIKit view with `userInteractionEnabled = NO` (read by the native probe). That is
react-native-screens 4.16.0's iOS 26+ code, fixed only by the dependency upgrade
(Priority 6) or a workaround (Priority 3). These scenarios are therefore expected
to fail on iOS 27 until then; that failure is the regression signal, not noise.

`NAV-STACK (state)` and `NAV-LINK (state)` (router-state harness, 1.15.2): 37
call-site cases, 22 link cases and 3 controls. Legacy: 33 of 62 end with a
second tab navigator, the tabs above another screen, or a second sign-in screen
(29 call-site cases, and 4 link cases: the website link while `/join` is the only
screen and while signed out, and 'Start using Pro' after an invite link, warm
and cold). Helper: 62/62.
