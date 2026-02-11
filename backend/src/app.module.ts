import { Module } from '@nestjs/common';
import { ExtractHarModule } from './extract-har/extract-har.module';

@Module({
  imports: [ExtractHarModule],
})
export class AppModule {}
