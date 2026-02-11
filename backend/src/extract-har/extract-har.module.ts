import { Module } from '@nestjs/common';
import { ExtractHarController } from './extract-har.controller';
import { ExtractHarService } from './extract-har.service';

@Module({
  controllers: [ExtractHarController],
  providers: [ExtractHarService],
})
export class ExtractHarModule {}
