export const MAX_BODY_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export const OPENAI_MODEL = 'gpt-5-mini';
export const MAX_PAYLOAD_CHARS = 100_000;
export const MAX_POSTDATA_CHARS = 4096;
export const DEFAULT_PORT = 3001;

export const HTTP2_PSEUDO_HEADERS = new Set([
  ':authority',
  ':method',
  ':path',
  ':scheme',
  ':status',
]);

export const CURL_DROP_HEADERS = new Set([
  'accept-encoding',
  'accept-language',
  'cache-control',
  'dnt',
  'pragma',
  'priority',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'content-length',
]);
