import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import { filterAndReduceHarWithMinimal } from './har-filter.util';
import type { HarLog, MinimalRequestSummary, RequestSummary } from './har.types';

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
   * Filter HAR to non-HTML entries, reduce to request summaries, then ask OpenAI to produce curl commands.
   * If description is provided, the LLM extracts the relevant request(s) matching it, then translates to curl.
   * Returns plain-text curl command(s), one per request.
   */
  async extractCurlFromHar(log: HarLog, description?: string | null): Promise<string> {
    const startMs = Date.now();
    const { full, minimal } = filterAndReduceHarWithMinimal(log);
    const filterMs = Date.now() - startMs;
    console.log(
      `[extract-har] filterAndReduceHarWithMinimal done in ${filterMs}ms, summaries: ${full.length}`,
    );

    await this.saveFilteredHar(full, minimal);

    if (minimal.length === 0) {
      return '';
    }
    const curlText = await this.requestCurlFromOpenAi(minimal, description);
    return curlText.trim();
  }

  /**
   * Write both filtered HAR versions for inspection and tuning.
   * - backend/filtered-har/last.json: full RequestSummary[] (pretty-printed)
   * - backend/filtered-har/last.minimal.json: MinimalRequestSummary[] (minified)
   */
  private async saveFilteredHar(
    full: RequestSummary[],
    minimal: MinimalRequestSummary[],
  ): Promise<void> {
    const dir = join(process.cwd(), 'filtered-har');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'last.json'),
        JSON.stringify(full, null, 2),
        'utf-8',
      );
      await writeFile(
        join(dir, 'last.minimal.json'),
        JSON.stringify(minimal),
        'utf-8',
      );
      console.log(`[extract-har] saved filtered HAR to ${dir}/last.json and last.minimal.json`);
    } catch (err) {
      console.warn('[extract-har] failed to save filtered HAR:', err);
    }
  }

  private async requestCurlFromOpenAi(
    minimal: MinimalRequestSummary[],
    description?: string | null,
  ): Promise<string> {
    const client = this.getClient();
    const payload = JSON.stringify(minimal);
    const hasDescription = description != null && description.trim().length > 0;

    const systemPrompt = hasDescription
      ? `You are a tool that helps reverse-engineer APIs from HAR (HTTP Archive) data.
Given a user description of the API they want to reverse-engineer and a JSON array of request objects (each with method, url, headers as object, and optionally postData with mimeType and text):
1. EXTRACT: Identify the request(s) from the array that best match the user's description.
2. TRANSLATE: Output ONLY the corresponding curl command(s) for those request(s).
- One curl command per selected request.
- Separate multiple curl commands with a single newline.
- Do not include any explanation, markdown, or extra text.
- Use -H for each header. The URL already includes query string; use it as-is.`
      : `You are a tool that converts HTTP request data into curl commands.
Given a JSON array of request objects (each with method, url, headers as object, and optionally postData with mimeType and text), output ONLY the corresponding curl command(s).
- One curl command per request.
- Separate multiple curl commands with a single newline.
- Do not include any explanation, markdown, or extra text.
- Use -H for each header. The URL already includes query string; use it as-is.`;

    const userMessage = hasDescription
      ? `The user wants to reverse-engineer this API: "${description.trim()}"

Here are the HTTP requests (JSON array). Extract the request(s) that match the description above, then output ONLY the curl command(s) for those request(s). Nothing else.\n\n${payload}`
      : `Convert these HTTP requests into curl commands. Output only the curl command(s), nothing else.\n\n${payload}`;

    console.log(
      `[extract-har] calling OpenAI (payload length ${userMessage.length} chars)`,
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
    console.log(`[extract-har] OpenAI responded in ${openAiMs}ms`);

    const content = completion.choices[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned no content.');
    }
    return content;
  }
}
