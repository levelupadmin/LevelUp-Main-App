/** Everything a learner hands in is a link. Read it, name it, check it. */

export interface LinkKind { name: string; word: string; icon: string; share?: boolean; yt?: boolean; ig?: boolean }

export function detect(url: string | null | undefined): LinkKind | null {
  const u = String(url ?? "").trim();
  if (!/^https?:\/\/[^\s/.]+\.[^\s]+/i.test(u)) return null;
  if (/docs\.google\.com\/document/i.test(u)) return { name: "Google Doc", word: "DOC", icon: "file-doc", share: true };
  if (/docs\.google\.com\/spreadsheets/i.test(u)) return { name: "Google Sheet", word: "SHEET", icon: "table", share: true };
  if (/docs\.google\.com\/presentation/i.test(u)) return { name: "Google Slides", word: "SLIDES", icon: "presentation", share: true };
  if (/drive\.google\.com/i.test(u)) return { name: "Google Drive", word: "DRIVE", icon: "google-drive-logo", share: true };
  if (/instagram\.com\/(reel|p|tv)\//i.test(u)) return { name: "Instagram post", word: "IG", icon: "instagram-logo", ig: true };
  if (/instagram\.com\//i.test(u)) return { name: "Instagram profile", word: "IG", icon: "instagram-logo", ig: true };
  if (/(youtube\.com|youtu\.be)/i.test(u)) return { name: "YouTube", word: "YT", icon: "youtube-logo", yt: true };
  if (/loom\.com/i.test(u)) return { name: "Loom", word: "LOOM", icon: "video-camera" };
  if (/canva\.com/i.test(u)) return { name: "Canva", word: "CANVA", icon: "palette" };
  return { name: "Link", word: "LINK", icon: "link" };
}

/** The badge for a part before anything is pasted. */
export function wordFor(kind: string): string {
  return ({ doc: "DOC", sheet: "SHEET", drive: "DRIVE", voice: "DRIVE", post: "POST", profile: "IG", loom: "LOOM", yt: "YT", sign: "SIGN" } as Record<string, string>)[kind] ?? "LINK";
}

export const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** Pull the first URL out of whatever was pasted (people paste captions too). */
export function extractUrl(text: string): string {
  const m = String(text ?? "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,]+$/, "") : String(text ?? "").trim();
}

export function youTubeId(url: string | null | undefined): string | null {
  const u = String(url ?? "");
  const m = u.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}
