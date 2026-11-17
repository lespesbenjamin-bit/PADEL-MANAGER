/* Côté serveur uniquement : télécharge un calendrier iCal */
const MAX_BYTES = 3_000_000;

function allowedUrl(u: string) {
  try {
    const x = new URL(u);
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && (x.hostname === "localhost" || x.hostname === "127.0.0.1");
  } catch { return false; }
}

export async function fetchIcs(url: string): Promise<string> {
  if (!allowedUrl(url)) throw new Error("Lien invalide (https obligatoire)");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "text/calendar, text/plain, */*" }, next: { revalidate: 300 } });
    if (!r.ok) throw new Error(`Le calendrier répond ${r.status}`);
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error("Calendrier trop volumineux");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Ce lien ne renvoie pas un calendrier iCal");
    return text;
  } finally { clearTimeout(t); }
}

