/** HAR types. See https://w3c.github.io/web-performance/specs/HAR/Overview.html */

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

export interface RequestSummary {
  method: string;
  url: string;
  headers: HarHeader[];
  queryString?: HarQueryString[];
  postData?: HarPostData;
}

export interface MinimalRequestSummary {
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: { mimeType?: string; text: string };
}

export interface ParseEntry extends RequestSummary {
  status: number;
}
