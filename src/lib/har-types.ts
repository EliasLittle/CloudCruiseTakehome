/**
 * Types for parse endpoint response (entries from backend).
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

export interface ParseEntry {
  method: string;
  url: string;
  headers: HarHeader[];
  queryString?: HarQueryString[];
  postData?: HarPostData;
  status: number;
}

export interface ParseHarResponse {
  count: number;
  entries: ParseEntry[];
}

export interface MatchResult {
  curl: string;
  matchedIndex?: number;
  confidence?: "high" | "medium" | "low";
  explanationBullets?: string[];
}
