// Transient handoff for the web "paste syllabus text" flow: app/syllabus/paste.tsx
// sets this right before navigating to app/syllabus/upload.tsx, which consumes
// it once on mount. In-memory only (not persisted) — a pasted syllabus can run
// to tens of thousands of characters, too large to thread through router params
// (which serialize into the URL on web), and there's no reason for it to survive
// a reload the way an OAuth token handoff does.
let pending: string | null = null;

export function setPendingScanText(text: string) {
  pending = text;
}

export function takePendingScanText(): string | null {
  const value = pending;
  pending = null;
  return value;
}
