/**
 * Minimal HAR (HTTP Archive) types for log.entries with request/response.
 * See https://w3c.github.io/web-performance/specs/HAR/Overview.html
 */

export interface HarHeader {
  name: string;
  value: string;
}

export interface HarQueryString {
  name: string;
  value: string;
}

export interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value: string }>;
}

export interface HarRequest {
  method: string;
  url: string;
  headers: HarHeader[];
  queryString?: HarQueryString[];
  postData?: HarPostData;
}

export interface HarContent {
  mimeType?: string;
  text?: string;
  encoding?: string;
}

export interface HarResponse {
  status: number;
  statusText?: string;
  headers: HarHeader[];
  content?: HarContent;
}

export interface HarEntry {
  request: HarRequest;
  response: HarResponse;
}

export interface HarLog {
  version?: string;
  entries: HarEntry[];
}

export interface HarRoot {
  log: HarLog;
}

/**
 * Reduced request shape passed to OpenAI (only fields needed for curl).
 * HTTP/2 pseudo-headers are stripped from headers.
 */
export interface RequestSummary {
  method: string;
  url: string;
  headers: HarHeader[];
  queryString?: HarQueryString[];
  postData?: HarPostData;
}

/**
 * Token-minimal shape for a single request when sending to OpenAI for curl generation.
 * - queryString omitted (url already has query)
 * - headers: only curl-relevant ones, as { [name]: value }
 * - postData: only mimeType + text (no params)
 */
export interface MinimalRequestSummary {
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: { mimeType?: string; text: string };
}
