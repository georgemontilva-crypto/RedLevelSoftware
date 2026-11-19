// Novedades: últimas noticias de videojuegos y próximos lanzamientos.
// Las noticias salen de los canales RSS que publican los propios medios (titular, entradilla y enlace a su web,
// siempre con el nombre del medio). Los lanzamientos, de la tienda de Steam. Todo se guarda unos minutos para
// no pedirlo en cada visita, y si una fuente falla se sigue con las demás.

import type { Express } from "express";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  image: string | null;
  /// Segundos Unix de publicación (0 si el canal no lo dice).
  at: number;
}

export interface Upcoming {
  id: number;
  name: string;
  /// Fecha tal como la anuncia la tienda: "20 NOV 2026", "T4 2026", "Próximamente"…
  date: string;
  image: string | null;
  url: string;
}

const env = process.env;
/// Medios en español primero. Se pueden cambiar con NEWS_FEEDS (direcciones separadas por comas).
const FEEDS = (env.NEWS_FEEDS ?? "https://vandal.elespanol.com/xml.cgi,https://www.eurogamer.es/feed,https://www.3djuegos.com/feedburner.xml")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
/// Si los de arriba no dan para llenar la sección, se completa con estos (en inglés).
const BACKUP_FEEDS = env.NEWS_FEEDS ? [] : ["https://www.pcgamer.com/feeds.xml", "https://www.eurogamer.net/feed"];
const STEAM = (env.STEAM_STORE_URL ?? "https://store.steampowered.com").replace(/\/+$/, "");
const TTL_SECONDS = 20 * 60;

async function get(url: string, ms = 9000): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "RedLevel/1.0 (lector de novedades)", Accept: "application/rss+xml, application/xml, application/json, text/xml, */*" } });
  if (!response.ok) throw new Error(`${response.status} en ${url}`);
  return response.text();
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", iexcl: "¡", iquest: "¿", uuml: "ü" };
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => entities[name.toLowerCase()] ?? whole);
}
/// Texto limpio: sin etiquetas, sin saltos y con las entidades resueltas (dos pasadas: muchos canales las anidan).
const plain = (text: string) => decode(decode(text).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml)?.[1] ?? "";
const attr = (xml: string, element: string, attribute: string) => new RegExp(`<${element}\\s[^>]*?${attribute}=["']([^"']+)["']`, "i").exec(xml)?.[1] ?? "";
const https = (url: string) => (/^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "");

/// Lee un canal RSS o Atom y devuelve sus noticias. Tolera lo que haya: lo que no se entiende se salta.
export function parseFeed(xml: string, fallbackSource: string): NewsItem[] {
  const head = xml.split(/<(?:item|entry)[\s>]/i)[0] ?? "";
  const source = plain(tag(head, "title")).replace(/\s*[-|–:].*$/, "").slice(0, 40) || fallbackSource;
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const block of blocks.slice(0, 30)) {
    const title = plain(tag(block, "title")).slice(0, 180);
    const url = https(decode(tag(block, "link")).trim() || decode(attr(block, "link", "href")));
    if (!title || !url) continue;
    const body = tag(block, "description") || tag(block, "summary") || tag(block, "content:encoded") || tag(block, "content");
    const when = Date.parse(plain(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date")));
    const image =
      https(decode(attr(block, "enclosure", "url"))) ||
      https(decode(attr(block, "media:content", "url"))) ||
      https(decode(attr(block, "media:thumbnail", "url"))) ||
      https(decode(/<img[^>]+src=["']([^"']+)["']/i.exec(decode(body + tag(block, "content:encoded")))?.[1] ?? ""));
    const summary = plain(body);
    items.push({ title, url, source, summary: summary.length > 190 ? `${summary.slice(0, 187).trimEnd()}…` : summary, image: image || null, at: Number.isFinite(when) ? Math.floor(when / 1000) : 0 });
  }
  return items;
}

async function readFeeds(feeds: string[]): Promise<NewsItem[]> {
  const results = await Promise.allSettled(feeds.map(async (feed) => parseFeed(await get(feed), new URL(feed).hostname.replace(/^www\./, ""))));
  results.forEach((result, index) => {
    if (result.status === "rejected") console.warn(`Novedades: no se pudo leer ${feeds[index]}: ${String(result.reason).slice(0, 120)}`);
  });
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function loadNews(): Promise<NewsItem[]> {
  let items = await readFeeds(FEEDS);
  if (items.length < 8 && BACKUP_FEEDS.length > 0) items = [...items, ...(await readFeeds(BACKUP_FEEDS))];
  const seen = new Set<string>();
  return items
    .filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)))
    .sort((a, b) => b.at - a.at)
    .slice(0, 30);
}

async function loadUpcoming(): Promise<Upcoming[]> {
  const featured = JSON.parse(await get(`${STEAM}/api/featuredcategories?cc=us&l=spanish`)) as { coming_soon?: { items?: Record<string, unknown>[] } };
  const list = (featured.coming_soon?.items ?? []).slice(0, 12);
  const out: Upcoming[] = [];
  for (const raw of list) {
    const id = Number(raw.id);
    const name = String(raw.name ?? "").slice(0, 120);
    if (!id || !name) continue;
    let date = "Próximamente";
    try {
      const details = JSON.parse(await get(`${STEAM}/api/appdetails?appids=${id}&l=spanish&filters=release_date`, 6000)) as Record<string, { data?: { release_date?: { date?: string } } }>;
      date = String(details[String(id)]?.data?.release_date?.date ?? "").slice(0, 40) || date;
    } catch {
      // Sin fecha se enseña igual, como "Próximamente".
    }
    const image = https(String(raw.header_image ?? "")) || https(String(raw.large_capsule_image ?? "")) || null;
    out.push({ id, name, date, image, url: `https://store.steampowered.com/app/${id}` });
  }
  return out;
}

let cache: { at: number; news: NewsItem[]; upcoming: Upcoming[] } | null = null;
let loading: Promise<void> | null = null;

async function refresh() {
  const [news, upcoming] = await Promise.all([loadNews().catch(() => [] as NewsItem[]), loadUpcoming().catch((e) => (console.warn(`Novedades: sin lanzamientos: ${String(e).slice(0, 120)}`), [] as Upcoming[]))]);
  // Si una fuente falla esta vez, se conserva lo último bueno que se tenía de ella.
  cache = { at: Math.floor(Date.now() / 1000), news: news.length > 0 ? news : (cache?.news ?? []), upcoming: upcoming.length > 0 ? upcoming : (cache?.upcoming ?? []) };
}

export function registerFeed(app: Express) {
  app.get("/api/feed", async (_req, res) => {
    const stale = !cache || Date.now() / 1000 - cache.at > TTL_SECONDS;
    if (stale) {
      loading ??= refresh().finally(() => (loading = null));
      // La primera vez se espera; después se sirve lo que hay mientras se renueva por detrás.
      if (!cache) await loading;
    }
    res.set("Cache-Control", "public, max-age=300");
    res.json({ news: cache?.news ?? [], upcoming: cache?.upcoming ?? [], updatedAt: cache?.at ?? 0 });
  });
}
