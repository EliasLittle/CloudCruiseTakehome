import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction, json } from 'express';
import multer from 'multer';
import { AppModule } from './app.module';
import { DEFAULT_PORT, MAX_BODY_SIZE_BYTES } from './constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: MAX_BODY_SIZE_BYTES }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_BODY_SIZE_BYTES },
      }).fields([
        { name: 'file', maxCount: 1 },
        { name: 'description', maxCount: 1 },
      ])(req, res, (err) => {
        if (err) next(err);
        else next();
      });
    } else {
      next();
    }
  });

  await app.listen(process.env.PORT ?? DEFAULT_PORT);
}
bootstrap();
