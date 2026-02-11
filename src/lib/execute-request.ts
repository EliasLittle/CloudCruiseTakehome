import type { ParseEntry } from "./har-types";

export interface ExecuteResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export async function executeRequest(
  entry: ParseEntry
): Promise<ExecuteResult> {
  const headers = new Headers();
  for (const h of entry.headers ?? []) {
    headers.set(h.name, h.value);
  }

  const init: RequestInit = {
    method: entry.method,
    headers,
  };

  if (
    entry.postData?.text &&
    ["POST", "PUT", "PATCH"].includes(entry.method)
  ) {
    init.body = entry.postData.text;
    if (entry.postData.mimeType && !headers.has("Content-Type")) {
      headers.set("Content-Type", entry.postData.mimeType);
    }
  }

  const response = await fetch(entry.url, init);
  const bodyText = await response.text();

  const headerRecord: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerRecord[key] = value;
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: headerRecord,
    body: bodyText,
  };
}
