# es-ES Apple Watch screenshots — what is and is not Spanish

Same provenance as `../watch-raw/README.md`: real captures of the shipping
Watch binary on an Ultra 2 simulator, placed in the listing's v2 composition,
regenerated and byte-checked by `scripts/build-watch-screenshots.py --check`.

One thing to know before using these, because it is visible in the image.

**The Watch app has no Spanish.** Every string in `targets/watch/` is a
hardcoded English literal — there is no `.lproj`, no `String(localized:)`, and
the shipped `SemoraWatch.app` contains no `.strings` file. The phone app is
fully translated in `locales/es.json`; the Watch companion never was.

So in these captures the *data* is genuinely Spanish, because task titles and
course names are pushed from the phone and belong to the student — `Informe de
laboratorio 3`, `Biología 101`, `Serie de problemas 7`. The *chrome* is English,
because that is what the app really renders: `Today`, `Overdue`, `Updated just
now`, `Completed`, `2d late`.

Nothing here was translated in post to hide that. Editing Spanish text into a
capture would misrepresent the binary, which is the one thing these screenshots
exist to rule out.

One further wrinkle, visible on rows due later this week: `watchDueLabel` builds
weekday and month names with a `DateFormatter` that pins no locale, so those
follow the system language while the text around them does not. A Spanish watch
shows `lun · Biología 101` under a header reading `Overdue`.

Localising the Watch is about twenty strings and needs a new build. Until then,
the honest options for the es-ES listing are to ship these as they are, or to
leave es-ES without a Watch set and let App Store Connect fall back to the
English screenshots.
