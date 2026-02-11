import {
  CURL_DROP_HEADERS,
  HTTP2_PSEUDO_HEADERS,
  MAX_POSTDATA_CHARS,
} from '../constants';
import type {
  HarEntry,
  HarHeader,
  HarLog,
  HarRequest,
  RequestSummary,
  MinimalRequestSummary,
  ParseEntry,
} from './har.types';

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

export function filterNonHtmlEntries(log: HarLog): HarEntry[] {
  if (!log.entries || !Array.isArray(log.entries)) return [];
  return log.entries.filter((entry) => !isHtmlResponse(entry));
}

function stripPseudoHeaders(headers: HarHeader[]): HarHeader[] {
  if (!headers || !Array.isArray(headers)) return [];
  return headers.filter(
    (h) => !HTTP2_PSEUDO_HEADERS.has(h.name.toLowerCase()),
  );
}

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

export function dedupeByUrlAndMethod<T extends { url: string; method: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.method} ${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterAndReduceHarWithStatus(log: HarLog): ParseEntry[] {
  const entries = filterNonHtmlEntries(log);
  const reduced = entries.map((e) => ({
    ...toRequestSummary(e.request),
    status: e.response?.status ?? 0,
  }));
  return dedupeByUrlAndMethod(reduced);
}

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
    const text = summary.postData.text;
    out.postData = {
      mimeType: summary.postData.mimeType,
      text:
        text.length > MAX_POSTDATA_CHARS
          ? text.slice(0, MAX_POSTDATA_CHARS) + '...'
          : text,
    };
  }
  return out;
}
