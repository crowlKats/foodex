/**
 * Web Share Target plumbing for the New Recipe page.
 *
 * Android Chrome (installed PWA only) POSTs a multipart body at
 * `/recipes/new`. The service worker stashes it in IndexedDB under the same
 * names used here, then redirects to a GET of this page. RecipeStart reads
 * query params immediately and consumes the stash for files (and any text
 * that did not fit in the URL). iOS Safari has no share target; we don't
 * pretend otherwise.
 *
 * Keep the IndexedDB names in sync with `public/sw.js`.
 */

export const SHARE_TARGET_DB = "foodex-share-target";
export const SHARE_TARGET_STORE = "incoming";
export const SHARE_TARGET_KEY = "latest";
export const SHARE_TARGET_FILES_FIELD = "images";
export const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_VALUE = 2000;

export interface ShareFields {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

export interface ShareFileRecord {
  name: string;
  type: string;
  buffer: ArrayBuffer;
}

export interface ShareRecord extends ShareFields {
  files?: ShareFileRecord[];
  createdAt: number;
}

function trimField(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function capQuery(value: string): string {
  return value.length > MAX_QUERY_VALUE
    ? value.slice(0, MAX_QUERY_VALUE)
    : value;
}

/** Build the paste that belongs in the New Recipe box. */
export function sharedImportText(fields: ShareFields): string {
  const url = trimField(fields.url);
  const text = trimField(fields.text);
  const title = trimField(fields.title);
  // Android's share sheet often leaves `url` empty and puts the link in
  // `text` (sometimes with a title on the line above). Prefer that paste
  // as-is when it already contains the URL.
  if (url && text) {
    if (text === url || text.includes(url)) return text;
    return `${url}\n${text}`;
  }
  if (url) return url;
  if (text) return text;
  return title;
}

/**
 * GET landing path after a share POST. Files cannot ride in the query
 * string; they stay in IndexedDB for RecipeStart.
 */
export function shareTargetLandingPath(fields: ShareFields): string {
  const params = new URLSearchParams();
  const url = trimField(fields.url);
  const text = trimField(fields.text);
  const title = trimField(fields.title);
  if (url) params.set("url", capQuery(url));
  if (text) params.set("text", capQuery(text));
  if (title && !url && !text) params.set("title", capQuery(title));
  const qs = params.toString();
  return qs ? `/recipes/new?${qs}` : "/recipes/new";
}

export function shareFieldsFromFormData(form: FormData): ShareFields {
  return {
    title: formString(form.get("title")),
    text: formString(form.get("text")),
    url: formString(form.get("url")),
  };
}

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export function isShareRecordFresh(
  record: { createdAt?: number },
  now = Date.now(),
): boolean {
  return typeof record.createdAt === "number" &&
    now - record.createdAt < SHARE_MAX_AGE_MS &&
    now - record.createdAt >= 0;
}

export function shareRecordToFiles(record: ShareRecord): File[] {
  const files: File[] = [];
  for (const f of record.files ?? []) {
    if (!f?.buffer || f.buffer.byteLength === 0) continue;
    files.push(
      new File([f.buffer], f.name || "image.jpg", {
        type: f.type || "image/jpeg",
      }),
    );
  }
  return files;
}

/**
 * Consume the latest stashed share, if it is still fresh. Returns null on
 * the server, when IndexedDB is missing, or when nothing is waiting.
 */
export async function takeIncomingShare(): Promise<
  {
    title: string;
    text: string;
    url: string;
    files: File[];
  } | null
> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const record = await idbTake<ShareRecord>(
      SHARE_TARGET_DB,
      SHARE_TARGET_STORE,
      SHARE_TARGET_KEY,
    );
    if (!record || !isShareRecordFresh(record)) return null;
    return {
      title: trimField(record.title),
      text: trimField(record.text),
      url: trimField(record.url),
      files: shareRecordToFiles(record),
    };
  } catch {
    return null;
  }
}

function idbTake<T>(
  dbName: string,
  storeName: string,
  key: string,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      let result: T | null = null;
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        result = (getReq.result as T | undefined) ?? null;
        if (result != null) store.delete(key);
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
