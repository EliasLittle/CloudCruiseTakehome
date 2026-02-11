import type {
  HarEntry,
  HarHeader,
  HarLog,
  HarRequest,
  RequestSummary,
  MinimalRequestSummary,
} from './har.types';

const HTTP2_PSEUDO_HEADERS = new Set([
  ':authority',
  ':method',
  ':path',
  ':scheme',
  ':status',
]);

/**
 * Returns true if the response is HTML (content-type text/html).
 * Checks response.content.mimeType first, then response.headers.
 */
function isHtmlResponse(entry: HarEntry): boolean {
  const res = entry.response;
  if (res.content?.mimeType) {
    const type = res.content.mimeType.split(';')[0].trim().toLowerCase();
    return type === 'text/html';
  }
  const ct = res.headers?.find(
    (h) => h.name.toLowerCase() === 'content-type',
  );
  if (!ct) return false;
  const type = ct.value.split(';')[0].trim().toLowerCase();
  return type === 'text/html';
}

/**
 * Filter HAR entries: exclude any request whose response is HTML.
 */
export function filterNonHtmlEntries(log: HarLog): HarEntry[] {
  if (!log.entries || !Array.isArray(log.entries)) return [];
  return log.entries.filter((entry) => !isHtmlResponse(entry));
}

/**
 * Strip HTTP/2 pseudo-headers from the headers array (curl uses normal headers).
 */
function stripPseudoHeaders(headers: HarHeader[]): HarHeader[] {
  if (!headers || !Array.isArray(headers)) return [];
  return headers.filter(
    (h) => !HTTP2_PSEUDO_HEADERS.has(h.name.toLowerCase()),
  );
}

/**
 * Reduce a HAR request to the fields needed for reverse-engineering / curl.
 * Strips pseudo-headers from the request headers.
 */
export function toRequestSummary(request: HarRequest): RequestSummary {
  return {
    method: request.method,
    url: request.url,
    headers: stripPseudoHeaders(request.headers ?? []),
    queryString: request.queryString?.length
      ? request.queryString
      : undefined,
    postData: request.postData,
  };
}

/**
 * Filter HAR log to non-HTML entries and reduce each to a RequestSummary.
 */
export function filterAndReduceHar(log: HarLog): RequestSummary[] {
  const entries = filterNonHtmlEntries(log);
  return entries.map((e) => toRequestSummary(e.request));
}

/**
 * Result of filtering with both full and minimal summaries.
 */
export interface FilteredHarResult {
  full: RequestSummary[];
  minimal: MinimalRequestSummary[];
}

/**
 * Filter HAR to non-HTML entries, reduce to full RequestSummary and token-minimal MinimalRequestSummary.
 * Use this when you need both the larger filtered file and the minimal one (e.g. for saving and for prompts).
 */
export function filterAndReduceHarWithMinimal(log: HarLog): FilteredHarResult {
  const full = filterAndReduceHar(log);
  const minimal = full.map(toMinimalRequestSummary);
  return { full, minimal };
}

/**
 * Header names that can be dropped when building curl: browser-only or redundant.
 * Keeps: authorization, content-type, accept, referer, origin, user-agent, cookie, and any unknown.
 */
const CURL_DROP_HEADERS = new Set([
  'accept-encoding', // curl adds automatically
  'accept-language',
  'cache-control',
  'dnt',
  'pragma',
  'priority', // HTTP/2; curl ignores
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'content-length', // curl sets from body
]);

/**
 * Reduce a RequestSummary to a token-minimal shape for OpenAI curl generation.
 * - Drops queryString (url already contains query).
 * - Drops browser-only / redundant headers.
 * - Compresses headers to Record<name, value>.
 * - postData: only mimeType + text (no params).
 */
export function toMinimalRequestSummary(
  summary: RequestSummary,
): MinimalRequestSummary {
  const headers: Record<string, string> = {};
  for (const h of summary.headers ?? []) {
    const name = h.name.toLowerCase();
    if (CURL_DROP_HEADERS.has(name)) continue;
    headers[h.name] = h.value;
  }
  const out: MinimalRequestSummary = {
    method: summary.method,
    url: summary.url,
    headers: headers,
  };
  if (summary.postData?.text != null) {
    out.postData = {
      mimeType: summary.postData.mimeType,
      text: summary.postData.text,
    };
  }
  return out;
}
