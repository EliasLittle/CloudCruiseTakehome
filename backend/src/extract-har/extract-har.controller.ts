import {
  BadRequestException,
  Controller,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ExtractHarService } from './extract-har.service';
import type { HarRoot } from './har.types';

const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller()
export class ExtractHarController {
  constructor(private readonly extractHarService: ExtractHarService) {}

  @Post('extract-har')
  async extractHar(@Req() req: Request, @Res() res: Response): Promise<void> {
    const startMs = Date.now();
    const contentType = req.headers['content-type'] ?? '';

    console.log('[extract-har] request started');

    let harRoot: HarRoot;

    if (contentType.includes('application/json')) {
      harRoot = await this.parseJsonBody(req, res);
    } else if (contentType.includes('multipart/form-data')) {
      harRoot = await this.parseMultipartBody(req, res);
    } else {
      throw new UnsupportedMediaTypeException(
        'Content-Type must be application/json or multipart/form-data',
      );
    }

    const parseMs = Date.now() - startMs;
    console.log(
      `[extract-har] body parsed in ${parseMs}ms, entries: ${harRoot.log.entries?.length ?? 0}`,
    );

    this.validateHar(harRoot);

    const curlText = await this.extractHarService.extractCurlFromHar(
      harRoot.log,
    );

    const totalMs = Date.now() - startMs;
    console.log(`[extract-har] OpenAI returned, sending response (total ${totalMs}ms)`);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(curlText);
  }

  private async parseJsonBody(
    req: Request,
    res: Response,
  ): Promise<HarRoot> {
    const rawBody: unknown = (req as Request & { body: unknown }).body;
    if (rawBody == null || typeof rawBody !== 'object') {
      throw new BadRequestException('Request body must be a JSON object with a log property');
    }
    const obj = rawBody as Record<string, unknown>;
    if (!obj.log || typeof obj.log !== 'object') {
      throw new BadRequestException('Request body must contain log with entries array');
    }
    const log = obj.log as Record<string, unknown>;
    if (!Array.isArray(log.entries)) {
      throw new BadRequestException('log.entries must be an array');
    }
    return { log: log as unknown as HarRoot['log'] };
  }

  private async parseMultipartBody(
    req: Request,
    _res: Response,
  ): Promise<HarRoot> {
    const file = (req as Request & { file?: Express.Multer.File & { buffer?: Buffer } }).file;
    if (!file || !file.buffer) {
      throw new BadRequestException(
        'multipart/form-data must include a file field with a .har file',
      );
    }
    return this.parseHarBuffer(file.buffer);
  }

  private parseHarBuffer(buffer: Buffer): HarRoot {
    if (buffer.length > MAX_BODY_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        `HAR file must be smaller than ${MAX_BODY_SIZE_BYTES / 1024 / 1024} MB`,
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Uploaded file is not valid JSON');
    }
    if (raw == null || typeof raw !== 'object') {
      throw new BadRequestException('HAR JSON must be an object with a log property');
    }
    const obj = raw as Record<string, unknown>;
    if (!obj.log || typeof obj.log !== 'object') {
      throw new BadRequestException('HAR must contain log with entries array');
    }
    const log = obj.log as Record<string, unknown>;
    if (!Array.isArray(log.entries)) {
      throw new BadRequestException('log.entries must be an array');
    }
    return { log: log as unknown as HarRoot['log'] };
  }

  private validateHar(harRoot: HarRoot): void {
    if (!harRoot.log?.entries || !Array.isArray(harRoot.log.entries)) {
      throw new BadRequestException('log.entries is required and must be an array');
    }
  }
}
