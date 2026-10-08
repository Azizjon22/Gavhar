import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { VideoProcessingService } from './video-processing.service';

@Module({
  controllers: [GalleryController],
  providers: [GalleryService, VideoProcessingService],
})
export class GalleryModule {}
