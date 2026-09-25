/**
 * Apple App Site Association — lets iOS open Semora's share links in the app.
 *
 * Only the three per-recipient share routes are claimed. Every marketing page
 * stays a web page: a student tapping a blog link from Google must land on the
 * blog, not be thrown into an app they may not want to open.
 *
 * Served by a route handler, not public/, so the Content-Type is
 * application/json without a headers() rule. force-static prerenders it at
 * build time; Apple's CDN fetches it on its own schedule, never per install.
 *
 * appID = <Team ID>.<bundle id>. Team 7T9897GFKH is the one in app.json
 * (ios.appleTeamId) and scripts/build-ios-local.sh. If either ever changes,
 * this must change in the same release or every link silently stops opening
 * the app.
 */
export const dynamic = 'force-static';

const APP_ID = '7T9897GFKH.com.rajeshpanta.syllabussnap';

const association = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [
          // `?*` = at least one character, so a bare /invite/ stays on the web.
          { '/': '/invite/?*', comment: 'Referral invite: lib/referral.ts inviteLink()' },
          { '/': '/join/?*', comment: 'Shared course: supabase/functions/share-course' },
          { '/': '/collaborate/?*', comment: 'Course space invite: lib/collaboration.ts' },
        ],
      },
    ],
  },
};

export function GET() {
  return new Response(JSON.stringify(association), {
    headers: {
      'Content-Type': 'application/json',
      // Apple's CDN caches on its own terms; this only bounds browsers/proxies.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
