import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import harToCurl from 'har-to-curl';
import OpenAI from 'openai';
import { MAX_PAYLOAD_CHARS, OPENAI_MODEL } from '../constants';
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

  /** Parse HAR and return non-HTML request entries with status (for list display). */
  parseHar(log: HarLog): ParseHarResponse {
    const entries = filterAndReduceHarWithStatus(log);
    return { count: entries.length, entries };
  }

  /** Find best-matching request by description and return curl + explanation. Batches when payload exceeds context limit. */
  async matchAndCurl(
    description: string,
    entries: RequestSummary[],
  ): Promise<MatchResult> {
    if (entries.length === 0) {
      return { curl: '' };
    }
    const minimal = entries.map(toMinimalRequestSummary);
    const payload = JSON.stringify(minimal);
    const client = this.getClient();

    if (payload.length <= MAX_PAYLOAD_CHARS) {
      return this.matchAndCurlSingle(client, description, entries, minimal);
    }

    return this.matchAndCurlBatched(
      client,
      description,
      entries,
      minimal,
    );
  }

  private async matchAndCurlSingle(
    client: OpenAI,
    description: string,
    entries: RequestSummary[],
    minimal: ReturnType<typeof toMinimalRequestSummary>[],
  ): Promise<MatchResult> {
    const matchResult = await this.matchRequest(client, description, minimal);
    const idx = matchResult.matchedIndex ?? 0;
    const safeIdx =
      idx >= 0
        ? Math.max(0, Math.min(idx, entries.length - 1))
        : 0;
    const fullRequest = entries[safeIdx];
    if (!fullRequest || matchResult.matchedIndex === -1) {
      return {
        curl: '',
        matchedIndex: idx === -1 ? undefined : safeIdx,
        confidence: matchResult.confidence,
        explanationBullets:
          matchResult.matchedIndex === -1
            ? ['No matching request found.']
            : matchResult.explanationBullets,
      };
    }

    const curl = this.requestToCurl(fullRequest);
    return {
      curl,
      matchedIndex: safeIdx,
      confidence: matchResult.confidence,
      explanationBullets: matchResult.explanationBullets,
    };
  }

  private async matchAndCurlBatched(
    client: OpenAI,
    description: string,
    entries: RequestSummary[],
    minimal: ReturnType<typeof toMinimalRequestSummary>[],
  ): Promise<MatchResult> {
    const batches = this.splitIntoBatches(minimal, entries);
    const batchResults: Array<{
      matchedIndex: number;
      confidence?: 'high' | 'medium' | 'low';
      explanationBullets?: string[];
      batchStart: number;
    }> = [];

    for (const batch of batches) {
      const result = await this.matchRequest(
        client,
        description,
        batch.minimal,
      );
      if (
        result.matchedIndex != null &&
        result.matchedIndex >= 0 &&
        result.matchedIndex < batch.minimal.length
      ) {
        batchResults.push({
          matchedIndex: result.matchedIndex,
          confidence: result.confidence,
          explanationBullets: result.explanationBullets,
          batchStart: batch.start,
        });
      }
    }

    if (batchResults.length === 0) {
      return {
        curl: '',
        explanationBullets: ['No matching request found in any batch.'],
      };
    }

    if (batchResults.length === 1) {
      const { matchedIndex, batchStart, confidence, explanationBullets } =
        batchResults[0]!;
      const globalIndex = batchStart + matchedIndex;
      const fullRequest = entries[globalIndex];
      if (!fullRequest) {
        return {
          curl: '',
          matchedIndex: globalIndex,
          confidence,
          explanationBullets,
        };
      }
      return {
        curl: this.requestToCurl(fullRequest),
        matchedIndex: globalIndex,
        confidence,
        explanationBullets,
      };
    }

    const bestWinner = await this.aggregateBatchWinners(
      client,
      description,
      batchResults,
      entries,
    );
    if (!bestWinner) {
      return {
        curl: '',
        explanationBullets: ['No matching request found in any batch.'],
      };
    }

    const { globalIndex, fullRequest, confidence, explanationBullets } =
      bestWinner;
    return {
      curl: this.requestToCurl(fullRequest),
      matchedIndex: globalIndex,
      confidence,
      explanationBullets,
    };
  }

  private splitIntoBatches(
    minimal: ReturnType<typeof toMinimalRequestSummary>[],
    entries: RequestSummary[],
  ): Array<{ minimal: ReturnType<typeof toMinimalRequestSummary>[]; entries: RequestSummary[]; start: number }> {
    const batches: Array<{
      minimal: ReturnType<typeof toMinimalRequestSummary>[];
      entries: RequestSummary[];
      start: number;
    }> = [];
    let start = 0;

    while (start < minimal.length) {
      let end = start;
      while (end < minimal.length) {
        if (
          JSON.stringify(minimal.slice(start, end + 1)).length > MAX_PAYLOAD_CHARS
        ) {
          break;
        }
        end++;
      }
      if (end === start) end = start + 1;

      batches.push({
        minimal: minimal.slice(start, end),
        entries: entries.slice(start, end),
        start,
      });
      start = end;
    }

    return batches;
  }

  private async aggregateBatchWinners(
    client: OpenAI,
    description: string,
    batchResults: Array<{
      matchedIndex: number;
      confidence?: 'high' | 'medium' | 'low';
      explanationBullets?: string[];
      batchStart: number;
    }>,
    entries: RequestSummary[],
  ): Promise<{
    globalIndex: number;
    fullRequest: RequestSummary;
    confidence?: 'high' | 'medium' | 'low';
    explanationBullets?: string[];
  } | null> {
    const candidates = batchResults.map((r, i) => {
      const globalIndex = r.batchStart + r.matchedIndex;
      const entry = entries[globalIndex];
      return {
        index: i,
        method: entry?.method ?? '?',
        url: entry?.url ?? '?',
        explanationBullets: r.explanationBullets ?? [],
        globalIndex,
        fullRequest: entry,
      };
    });

    const validCandidates = candidates.filter(
      (c): c is typeof c & { fullRequest: RequestSummary } =>
        c.fullRequest != null,
    );
    if (validCandidates.length === 0) return null;

    if (validCandidates.length === 1) {
      const c = validCandidates[0]!;
      return {
        globalIndex: c.globalIndex,
        fullRequest: c.fullRequest,
        confidence: batchResults[c.index]!.confidence,
        explanationBullets: batchResults[c.index]!.explanationBullets,
      };
    }

    const candidatesPayload = validCandidates.map((c, i) => ({
      index: i,
      method: c.method,
      url: c.url,
      explanationBullets: c.explanationBullets,
    }));

    const systemPrompt = `You are a tool that picks the best API request from a set of candidates.
Given a user description and a list of candidate requests (each with method, url, and explanationBullets):
Pick the SINGLE candidate (by 0-based index) that best matches the user's description.
Respond with a valid JSON object only: {"bestIndex": <number>}`;

    const userMessage = `The user wants to reverse-engineer: "${description.trim()}"

Candidates (0-based index):
${JSON.stringify(candidatesPayload, null, 2)}

Output ONLY a JSON object: {"bestIndex": <number>}`;

    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 1,
    });

    const content = completion.choices[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned no content.');
    }

    const trimmed = content.trim();
    let jsonStr = trimmed;
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1]!.trim();

    let bestIndex: number;
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      if (
        typeof obj.bestIndex !== 'number' ||
        !Number.isInteger(obj.bestIndex)
      ) {
        bestIndex = 0;
      } else {
        bestIndex = Math.max(
          0,
          Math.min(obj.bestIndex, validCandidates.length - 1),
        );
      }
    } catch {
      bestIndex = 0;
    }

    const winner = validCandidates[bestIndex]!;
    const batchResult = batchResults[validCandidates[bestIndex]!.index]!;
    return {
      globalIndex: winner.globalIndex,
      fullRequest: winner.fullRequest,
      confidence: batchResult.confidence,
      explanationBullets: batchResult.explanationBullets,
    };
  }

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
{"matchedIndex": <number>, "confidence": "high"|"medium"|"low"|"none", "explanationBullets": ["reason 1", "reason 2"]}
- matchedIndex: 0-based index into the array, or -1 if NO request matches the description.
- confidence: how well the request matches (use "none" when matchedIndex is -1).
- explanationBullets: 2-4 short bullet points.`;

    const userMessage = `The user wants to reverse-engineer this API: "${description.trim()}"

Here are the HTTP requests (JSON array, 0-based indices). Pick the ONE request that best matches the description. Output ONLY a JSON object with matchedIndex, confidence, and explanationBullets.\n\n${payload}`;

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

    const content = completion.choices[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned no content.');
    }

    return this.parseMatchOnlyResult(content, minimal.length);
  }

  private requestToCurl(request: RequestSummary): string {
    const entry = {
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers ?? [],
        cookies: [] as Array<{ name: string; value: string }>,
        postData: request.postData,
      },
    };
    const curl = harToCurl(entry);
    return typeof curl === 'string' ? curl : '';
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
        if (obj.matchedIndex === -1) {
          matchedIndex = -1;
        } else {
          matchedIndex = Math.max(0, Math.min(obj.matchedIndex, maxIndex - 1));
        }
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
}
