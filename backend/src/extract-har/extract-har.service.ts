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
    const payload = JSON.stringify(minimal);
    const systemPrompt = `You are a tool that helps reverse-engineer APIs from HAR (HTTP Archive) data.
Given a user description of the API they want to reverse-engineer and a JSON array of request objects (each with method, url, headers as object, and optionally postData with mimeType and text):
1. EXTRACT: Identify the SINGLE request from the array (by 0-based index) that best matches the user's description.
2. OUTPUT: Respond with a valid JSON object only, no markdown or extra text. Use this exact shape:
{"matchedIndex": <number>, "confidence": "high"|"medium"|"low", "explanationBullets": ["reason 1", "reason 2"], "curl": "<single curl command for that request>"}
- matchedIndex: 0-based index into the array.
- confidence: how well the request matches the description.
- explanationBullets: 2-4 short bullet points explaining why this request matches.
- curl: the curl command for that one request. Use -H for each header. URL as-is.`;

    const userMessage = `The user wants to reverse-engineer this API: "${description.trim()}"

Here are the HTTP requests (JSON array, 0-based indices). Pick the ONE request that best matches the description, then output ONLY a JSON object with matchedIndex, confidence, explanationBullets, and curl.\n\n${payload}`;

    console.log(
      `[extract-har] matchAndCurl calling OpenAI (payload length ${userMessage.length} chars)`,
    );
    const openAiStartMs = Date.now();

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
    } catch (err) {
      throw new BadGatewayException('OpenAI request failed. Please try again: ' + err.message);
    }

    const openAiMs = Date.now() - openAiStartMs;
    console.log(`[extract-har] matchAndCurl OpenAI responded in ${openAiMs}ms`);

    const content = completion.choices[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned no content.');
    }

    return this.parseMatchResult(content, minimal.length);
  }

  private parseMatchResult(raw: string, maxIndex: number): MatchResult {
    const trimmed = raw.trim();
    let jsonStr = trimmed;
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    }
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const curl = typeof obj.curl === 'string' ? obj.curl : '';
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
      return { curl, matchedIndex, confidence, explanationBullets };
    } catch {
      return { curl: trimmed };
    }
  }
}
