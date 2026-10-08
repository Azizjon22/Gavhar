import { Global, Module } from '@nestjs/common';
import { PhotoService } from './photo.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, PhotoService],
  exports: [StorageService, PhotoService],
})
export class StorageModule {}
