// Physical location of a song: {category code}-{binder}.{page}, e.g. NL-1.01.
// Stored as separate fields; this code is only ever generated for display.

export function formatPage(page: number) {
  return page < 10 ? `0${page}` : String(page);
}

export function formatLocation(code: string, binder: number, page: number) {
  return `${code}-${binder}.${formatPage(page)}`;
}

export function formatBinder(code: string, binder: number) {
  return `${code}-${binder}`;
}

/** Binder numbers available in a category: 1..binderCount. */
export function binderNumbers(binderCount: number) {
  return Array.from({ length: Math.max(0, binderCount) }, (_, index) => index + 1);
}

/** Label used in confirmations, e.g. "#125 – Xin Dâng Lời Cảm Tạ (DL-1.03)". */
export function songLabel(song: { songNumber: number | null; title: string; location: string }) {
  return song.songNumber != null
    ? `#${song.songNumber} – ${song.title} (${song.location})`
    : `${song.location} – ${song.title}`;
}
