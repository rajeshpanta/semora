/**
 * Format a Date as YYYY-MM-DD using the *local* timezone components.
 *
 * Why this exists: `date.toISOString().split('T')[0]` looks innocent
 * but converts to UTC first. A user in PDT picking April 30 at 6pm
 * local time would have their date saved as 2026-05-01 in the DB
 * (because 6pm PDT = 1am UTC the next day). This shifts task due
 * dates and notification scheduling by a day for anyone west of UTC.
 *
 * Always use this helper when you mean "the calendar date the user
 * picked," never `toISOString().split('T')[0]`.
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
