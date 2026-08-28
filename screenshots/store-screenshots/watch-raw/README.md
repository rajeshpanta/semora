# Apple Watch App Store screenshots — source trail

The Watch UI in every shipped screenshot is the Semora Watch app itself. Nothing
inside the device was drawn, recreated, retouched, or restyled.

## Where the pixels come from

| | |
|---|---|
| Binary | `SemoraWatch.app` built from the same source as the submitted archive — Semora **1.11 (55)**, commit `eab9112` |
| Device | Apple Watch Ultra 2 (49mm) Simulator, watchOS 10.5 (`9C60CBC5-B400-4A6A-918E-2CEE5F2C9A72`) |
| Capture | `xcrun simctl io <udid> screenshot` — the simulator's own framebuffer |
| Size | 410 × 502, the native Ultra 2 panel and App Store Connect's `APP_WATCH_ULTRA` size |

`watch-raw/` holds the untouched captures. `watch/` holds what was submitted:
the same capture, scaled once and placed inside the listing's v2 marketing
composition — cream-to-lavender gradient, white eyebrow pill with a
letterspaced violet label, Fraunces headline whose second line turns violet,
device bleeding off the bottom edge. Every one of those elements lives outside
the screen rectangle. The colours are sampled from screenshots currently live on
the store, not guessed, so the Watch set reads as part of the same listing as
the iPhone and iPad sets.

`scripts/build-watch-screenshots.py` composes them, and `--check` re-renders
from `watch-raw/` and demands a byte-for-byte match with what is committed. That
is the guarantee worth having: the shipped image is a pure function of an
untouched capture, so a retouched screen could not survive the check.

Two things the composition deliberately does not do. It does not draw over the
screen — no callouts, no fake notifications, no substituted text. And it does not
clip it: the display's corner radius is rounder on the case than on the screen,
because matching the two ate the first letter of the caught-up copy, and a frame
may not crop the product it is framing.

## Where the data comes from

No real student's data was used, and no account was signed in.

The Watch app's entire state is one WatchConnectivity application context sent
by the phone. For these captures that context was sent by a small test sender
carrying **synthetic** coursework — the same course names the existing iPhone
screenshots use (Biology 101, Calc II, History 210). The sender is only the
transport: it emits the exact wire format `modules/semora-watch-bridge` emits,
and the real, unmodified Watch binary decodes it and draws every pixel with its
own SwiftUI.

`03-completed.png` is a genuine round trip, not a posed state: the row was
tapped in the simulator, the Watch sent a real completion request, the sender
answered with a real ack, and the row reached `.done` the only way it can.

## The Watch does not speak Spanish

Worth knowing before anyone adds a locale here. The listing is localised into
es-ES, but the Watch app is not localised at all: no `.lproj`, no
`String(localized:)`, and no `.strings` in the shipped `SemoraWatch.app`. Every
user-facing string in `targets/watch/` is a hardcoded English literal — `Today`,
`Overdue`, `Updated just now`, `Completed`, `2d late`. The phone app is fully
translated in `locales/es.json`; the Watch companion never was.

`watchDueLabel` is the one exception, and not a happy one: it formats weekday
and month names through a `DateFormatter` with no locale pinned, so those follow
the system language while everything around them does not. A Spanish watch shows
`lun · Biología 101` under a header reading `Overdue`.

A Spanish set was built and then dropped for 1.11, because it could only have
been a Spanish headline over English chrome. App Store Connect falls back to the
primary locale, so Spanish shoppers see the English screenshots above — which is
an accurate preview of the watch they will actually get. Localising the Watch is
roughly twenty strings and needs its own build; do that first, then add the
locale back to `scripts/build-watch-screenshots.py`.

## What is deliberately absent

There is no complication or Smart Stack screenshot. The widget is in the build
and declares `.accessoryRectangular`, `.accessoryCircular` and
`.accessoryInline`, but the watchOS 10.5 simulator's widget gallery would not
open, so it could not be genuinely captured — see `complication-attempt/`, which
records how far the flow got. Drawing a mock-up of it would have been the one
thing these screenshots must never be.
