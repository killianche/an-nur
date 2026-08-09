/**
 * Azkar data loader.
 *
 * The JSON at /azkar/azkar.json is small (~200 KB), static, and the
 * browser caches it for free — but we still want every screen that
 * imports this module to share a single in-flight promise so we don't
 * fire a parallel network request when the user taps from index to
 * category in <100 ms.
 */

export type AzkarCategoryId = 'morning' | 'evening' | 'intro';

export type AzkarCategoryMeta = {
  id: AzkarCategoryId;
  title_ing: string;
  title_ru: string;
};

/** One described reward for reciting the azkar a specific number of
 *  times, with the hadith refs that report it.  Rendered inside the
 *  collapsible "Источник" / "Награды" block on the azkar card. */
export type AzkarReward = {
  /** Human label, e.g. "Тот, кто 100 раз в день скажет (эти слова)…".
   *  Verbatim text from the user / source — copy unchanged. */
  text: string;
  /** Hadith references — short labelled entries like
   *  "аль-Бухари 3293, 6405".  Rendered as a row of pills. */
  hadiths: string[];
};

/** One ayah of a sura-mode azkar (e.g. Al-Ikhlas / Al-Falaq / An-Nas).
 *  When `AzkarEntry.ayahs` is present, the card renders Quran-style:
 *  big arabic per ayah, "112:1" chip, then translations underneath. */
export type AzkarAyah = {
  /** Arabic verbatim from the source. */
  arabic: string;
  /** Ingush translation verbatim. */
  ingush: string;
  /** Russian translation verbatim. */
  russian: string;
};

export type AzkarEntry = {
  id: string;
  category: AzkarCategoryId | 'unknown';
  page: string;
  n_audio: number;
  n_in_category: number;
  /** Plain text of the section label, e.g. "1уйран" / "Сайран". */
  header_label: string | null;
  /** Arabic supplication text (may be multi-line, HTML-flavoured with <b>). */
  arabic: string | null;
  /** Ingush cyrillic transliteration. */
  translit_ingush: string | null;
  /** Russian translation. */
  russian: string | null;
  /** Hadith attribution string, e.g. "Хьадис (сохьихь да аьнна)
   *  хьадоаладаьраш: Абу Дауд, Ат-Тирмизи ба".  Split off from the end
   *  of the Ingush / Russian translation at build time so the screen can
   *  render it separately as a small chip instead of letting it hang
   *  off the body paragraph. */
  source: string | null;
  /** Structured rewards (optional).  When present, the card renders a
   *  collapsible "Источник" panel listing each reward + its hadith refs,
   *  instead of (or alongside) the plain `source` string. */
  rewards?: AzkarReward[];
  /** Sura number (1-114) — present when the azkar is a verbatim
   *  recitation of a Quranic sura.  Drives the "N:M" verse chips that
   *  render under each ayah in sura-mode. */
  surah_number?: number;
  /** First ayah number for the entry — used to render correct
   *  "{surah}:{ayah}" chips when the entry quotes an arbitrary verse
   *  range (e.g. 2:255 alone, or 2:285-286).  Defaults to 1 so the
   *  full-sura entries (Al-Ikhlas / Al-Falaq / An-Nas) keep their
   *  legacy numbering (112:1, 113:1, 114:1 …) without explicit value. */
  start_ayah?: number;
  /** Per-ayah breakdown (optional).  When present, the card renders
   *  Quran-style: each ayah block with its own arabic + translation.
   *  Falls back to the flat `arabic`/`russian`/`translit_ingush` fields
   *  when this is absent. */
  ayahs?: AzkarAyah[];
  /** Recommended recitation count (tasbih).  When > 1 the card shows
   *  a tap-counter chip and tapping the body increments it; reaching
   *  the target plays a small "done" state.  Absent / 1 → no counter. */
  recommended_count?: number;
  /** Audio for the "Book 1" (morning recitation order). Filename inside
   *  /azkar/audio/ — e.g. "kn1-7.ogg". Null if no recording for this entry. */
  audio_book1: string | null;
  audio_book2: string | null;
};

export type AzkarData = {
  version: number;
  total_entries: number;
  by_category: Record<string, number>;
  categories: AzkarCategoryMeta[];
  entries: AzkarEntry[];
};

let cachedPromise: Promise<AzkarData> | null = null;

export function loadAzkarData(): Promise<AzkarData> {
  if (cachedPromise) return cachedPromise;
  // No `cache: 'force-cache'` here on purpose:  the JSON file is rebuilt
  // every time we re-run `publish_to_web.py` (e.g. after editing
  // `clean_arabic()` in `build_json.py`), and force-cache made browsers
  // pin the first-seen version forever — the user kept seeing the old,
  // not-yet-stripped Arabic blob until a hard reload.  Plain fetch lets
  // standard HTTP caching headers do the right thing; the in-memory
  // `cachedPromise` below still de-dupes parallel requests from the
  // index → category transition.
  cachedPromise = fetch('/azkar/azkar.json')
    .then(r => {
      if (!r.ok) throw new Error(`azkar.json HTTP ${r.status}`);
      return r.json() as Promise<AzkarData>;
    })
    .catch(err => {
      // Drop the broken promise so a later attempt can retry — otherwise
      // every screen mount returns the same rejected promise forever and
      // there's no path back to a working state without a hard reload.
      cachedPromise = null;
      throw err;
    });
  return cachedPromise;
}

/** Build the absolute URL for an audio file living under /public/azkar/audio/. */
export function azkarAudioUrl(filename: string): string {
  return `/azkar/audio/${filename}`;
}

/** Pick the audio file to use for an entry within a category. Falls back
 *  across books because morning entries occasionally have only Кн2 audio
 *  and vice versa. */
export function pickAudio(entry: AzkarEntry, category: AzkarCategoryId): string | null {
  // Default ordering: morning prefers Кн1, evening prefers Кн2.
  const first = category === 'evening' ? entry.audio_book2 : entry.audio_book1;
  const second = category === 'evening' ? entry.audio_book1 : entry.audio_book2;
  return first ?? second ?? null;
}
