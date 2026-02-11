import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  filterAndReduceHarWithStatus,
  toMinimalRequestSummary,
} from './har-filter.util';
import type { HarLog, ParseEntry, RequestSummary } from './har.types';

export interface ParseHarResponse {
  count: number;
  entries: ParseEntry[];
}

export interface MatchResult {
  curl: string;
  matchedIndex?: number;
  confidence?: 'high' | 'medium' | 'low';
  explanationBullets?: string[];
}

const OPENAI_MODEL = 'gpt-5-mini';

@Injectable()
export class ExtractHarService {
  private openai: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.openai) {
      const key = process.env.OPENAI_API_KEY;
      if (!key || typeof key !== 'string' || !key.trim()) {
        throw new ServiceUnavailableException(
          'OpenAI API key is not configured. Set OPENAI_API_KEY.',
        );
      }
      this.openai = new OpenAI({ apiKey: key });
    }
    return this.openai;
  }

  /**
   * Parse HAR and return non-HTML request entries with status (for list display).
   */
  parseHar(log: HarLog): ParseHarResponse {
    const entries = filterAndReduceHarWithStatus(log);
    return { count: entries.length, entries };
  }

  /**
   * Given description and entries, ask LLM to find best-matching request and return curl + explanation.
   * Uses two prompts: (1) match minimal requests to description, (2) convert full matched request to curl.
   */
  async matchAndCurl(
    description: string,
    entries: RequestSummary[],
  ): Promise<MatchResult> {
    if (entries.length === 0) {
      return { curl: '' };
    }
    const minimal = entries.map(toMinimalRequestSummary);
    const client = this.getClient();

    // Step 1: Match description to a single request (minimal payload)
    const matchResult = await this.matchRequest(client, description, minimal);
    const idx = matchResult.matchedIndex ?? 0;
    const safeIdx = Math.max(0, Math.min(idx, entries.length - 1));
    const fullRequest = entries[safeIdx];
    if (!fullRequest) {
      return {
        curl: '',
        matchedIndex: safeIdx,
        confidence: matchResult.confidence,
        explanationBullets: matchResult.explanationBullets,
      };
    }

    // Step 2: Convert full request to curl
    const curl = await this.requestToCurl(client, fullRequest);

    return {
      curl,
      matchedIndex: safeIdx,
      confidence: matchResult.confidence,
      explanationBullets: matchResult.explanationBullets,
    };
  }

  /**
   * Prompt 1: Given description and minimal requests, return matched index + explanation (no curl).
   */
  private async matchRequest(
    client: OpenAI,
    description: string,
    minimal: ReturnType<typeof toMinimalRequestSummary>[],
  ): Promise<{
    matchedIndex?: number;
    confidence?: 'high' | 'medium' | 'low';
    explanationBullets?: string[];
  }> {
    const payload = JSON.stringify(minimal);
    const systemPrompt = `You are a tool that helps reverse-engineer APIs from HAR (HTTP Archive) data.
Given a user description of the API they want to reverse-engineer and a JSON array of request objects (each with method, url, headers as object, and optionally postData with mimeType and text):
1. EXTRACT: Identify the SINGLE request from the array (by 0-based index) that best matches the user's description.
2. OUTPUT: Respond with a valid JSON object only, no markdown or extra text. Use this exact shape:
{"matchedIndex": <number>, "confidence": "high"|"medium"|"low", "explanationBullets": ["reason 1", "reason 2"]}
- matchedIndex: 0-based index into the array.
- confidence: how well the request matches the description.
- explanationBullets: 2-4 short bullet points explaining why this request matches.`;

    const userMessage = `The user wants to reverse-engineer this API: "${description.trim()}"

Here are the HTTP requests (JSON array, 0-based indices). Pick the ONE request that best matches the description. Output ONLY a JSON object with matchedIndex, confidence, and explanationBullets.\n\n${payload}`;

    console.log(
      `[extract-har] matchRequest calling OpenAI (payload length ${userMessage.length} chars)`,
    );
    const startMs = Date.now();

    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 1,
      });
    } catch (err: unknown) {
      throw new BadGatewayException(
        'OpenAI request failed. Please try again: ' + (err instanceof Error ? err.message : String(err)),
      );
    }

    console.log(`[extract-har] matchRequest OpenAI responded in ${Date.now() - startMs}ms`);

    const content = completion.choices[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned no content.');
    }

    return this.parseMatchOnlyResult(content, minimal.length);
  }

  /**
   * Prompt 2: Given full request details, return a curl command.
   */
  private async requestToCurl(
    client: OpenAI,
    request: RequestSummary,
  ): Promise<string> {
    const payload = JSON.stringify({
      method: request.method,
      url: request.url,
      headers: request.headers ?? [],
      queryString: request.queryString,
      postData: request.postData,
    });
    const systemPrompt = `You convert HTTP request data into a single curl command.
Given a JSON object with method, url, headers (array of {name, value}), optionally queryString (array of {name, value}), and optionally postData (mimeType, text):
- Output ONLY a valid JSON object with this shape: {"curl": "<curl command>"}
- Use -H for each header (except HTTP/2 pseudo-headers like :authority, :method, :path, :scheme).
- Use -X for the method. Include --data-raw for POST/PUT body when postData.text is present.
- URL as-is. No markdown or extra text.`;

    const userMessage = `Convert this HTTP request to a curl command. Output only a JSON object with a "curl" field.\n\n${payload}`;

    console.log(
      `[extract-har] requestToCurl calling OpenAI (payload length ${userMessage.length} chars)`,
    );
    const startMs = Date.now();

    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 1,
      });
    } catch (err: unknown) {
      throw new BadGatewayException(
        'OpenAI request failed. Please try again: ' + (err instanceof Error ? err.message : String(err)),
      );
    }

    console.log(`[extract-har] requestToCurl OpenAI responded in ${Date.now() - startMs}ms`);

    const content = completion.choices[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned no content.');
    }

    return this.parseCurlResult(content);
  }

  private parseMatchOnlyResult(
    raw: string,
    maxIndex: number,
  ): {
    matchedIndex?: number;
    confidence?: 'high' | 'medium' | 'low';
    explanationBullets?: string[];
  } {
    const trimmed = raw.trim();
    let jsonStr = trimmed;
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    }
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      let matchedIndex: number | undefined;
      if (typeof obj.matchedIndex === 'number' && Number.isInteger(obj.matchedIndex)) {
        matchedIndex = Math.max(0, Math.min(obj.matchedIndex, maxIndex - 1));
      }
      let confidence: 'high' | 'medium' | 'low' | undefined;
      if (typeof obj.confidence === 'string' && ['high', 'medium', 'low'].includes(obj.confidence)) {
        confidence = obj.confidence as 'high' | 'medium' | 'low';
      }
      let explanationBullets: string[] | undefined;
      if (Array.isArray(obj.explanationBullets)) {
        explanationBullets = obj.explanationBullets.filter((x): x is string => typeof x === 'string');
      }
      return { matchedIndex, confidence, explanationBullets };
    } catch {
      return {};
    }
  }

  private parseCurlResult(raw: string): string {
    const trimmed = raw.trim();
    let jsonStr = trimmed;
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    }
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      return typeof obj.curl === 'string' ? obj.curl : trimmed;
    } catch {
      return trimmed;
    }
  }

}
