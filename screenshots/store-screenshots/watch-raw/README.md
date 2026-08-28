# Apple Watch App Store screenshots — source trail

Every image in `watch/` is a byte-for-byte render of the Semora Watch app itself.
Nothing here was drawn, recreated, retouched, or composited.

## Where the pixels come from

| | |
|---|---|
| Binary | `SemoraWatch.app` built from the same source as the submitted archive — Semora **1.11 (55)**, commit `eab9112` |
| Device | Apple Watch Ultra 2 (49mm) Simulator, watchOS 10.5 (`9C60CBC5-B400-4A6A-918E-2CEE5F2C9A72`) |
| Capture | `xcrun simctl io <udid> screenshot` — the simulator's own framebuffer |
| Size | 410 × 502, the native Ultra 2 panel and App Store Connect's `APP_WATCH_ULTRA` size |

`watch-raw/` holds the untouched captures. `watch/` holds what was submitted.
The only difference between a raw file and its final counterpart is that the
final one carries no alpha channel, which App Store Connect requires; the RGB
pixel data is identical, and `scripts/build-watch-screenshots.py --check` asserts that.

## Where the data comes from

No real student's data was used, and no account was signed in.

The Watch app's entire state is one WatchConnectivity application context sent
by the phone. For these captures that context was sent by a small test sender
carrying **synthetic** coursework — the same course names the existing iPhone
screenshots use (Biology 101, Calc II, History 210, Chem 105). The sender is
only the transport: it emits the exact wire format
`modules/semora-watch-bridge` emits, and the real, unmodified Watch binary
decodes it and draws every pixel with its own SwiftUI.

`03-completed.png` is a genuine round trip, not a posed state: the row was
tapped in the simulator, the Watch sent a real completion request, the sender
answered with a real ack, and the row reached `.done` the only way it can.

## What is deliberately absent

There is no complication or Smart Stack screenshot. The widget is in the build
and declares `.accessoryRectangular`, `.accessoryCircular` and
`.accessoryInline`, but the watchOS 10.5 simulator's widget gallery would not
open, so it could not be genuinely captured — see `complication-attempt/`, which
records how far the flow got. Drawing a mock-up of it would have been the one
thing these screenshots must never be.

## Why there is no marketing frame

The iPhone and iPad screenshots put the device inside a headline-and-gradient
composition. That treatment cannot carry over: App Store Connect accepts Apple
Watch screenshots only at the exact panel size, so a headline could only be
bought by shrinking the product UI into a letterbox — smaller and less legible
than what a student actually sees. The brand still reads, because it is in the
app: the violet wordmark, the violet and red count tiles, the per-course colour
bars.
