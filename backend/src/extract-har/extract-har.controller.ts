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
import type { HarRoot, RequestSummary } from './har.types';

const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller()
export class ExtractHarController {
  constructor(private readonly extractHarService: ExtractHarService) {}

  @Post('extract-har/parse')
  async parseHar(@Req() req: Request, @Res() res: Response): Promise<void> {
    const contentType = req.headers['content-type'] ?? '';
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
    this.validateHar(harRoot);
    const result = this.extractHarService.parseHar(harRoot.log);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
  }

  @Post('extract-har/match')
  async matchRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const body = (req as Request & { body?: unknown }).body;
    if (body == null || typeof body !== 'object') {
      throw new BadRequestException('Request body must be a JSON object');
    }
    const obj = body as Record<string, unknown>;
    const description = obj.description;
    const entries = obj.entries;
    if (typeof description !== 'string' || !description.trim()) {
      throw new BadRequestException('body.description is required and must be a non-empty string');
    }
    if (!Array.isArray(entries)) {
      throw new BadRequestException('body.entries must be an array of request summaries');
    }
    const summaries = entries as RequestSummary[];
    const result = await this.extractHarService.matchAndCurl(description.trim(), summaries);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
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

  private async parseMultipartBody(req: Request, _res: Response): Promise<HarRoot> {
    const files = (req as Request & { files?: Record<string, Express.Multer.File[]> }).files;
    const file = files?.['file']?.[0] as (Express.Multer.File & { buffer?: Buffer }) | undefined;
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
