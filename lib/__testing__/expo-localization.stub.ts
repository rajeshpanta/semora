/** expo-localization stand-in, for Deno tests only. See appStore.stub.ts. */
export function getLocales() {
  return [{ languageCode: 'en', languageTag: 'en-US' }];
}

/**
 * The device's calendar settings. `uses24hourClock` lives here rather than on
 * the locale, and the tests run as a US device so it is false — which keeps
 * every existing time assertion (11:59 PM) true.
 */
export function getCalendars() {
  return [{ calendar: 'gregory', timeZone: 'America/Los_Angeles', uses24hourClock: false, firstWeekday: 1 }];
}
