import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import {
  CompleteVideoUploadDto,
  CreateAlbumDto,
  InitVideoUploadDto,
  UpdateAlbumDto,
} from './dto/gallery.dto';
import { GalleryService } from './gallery.service';

@ApiTags('Galereya')
@ApiBearerAuth()
@Controller('gallery/albums')
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Get()
  @Permissions('media:read')
  @ApiOperation({ summary: 'Albomlar (rasm va videolari bilan)' })
  list() {
    return this.gallery.listAlbums();
  }

  @Post()
  @Permissions('media:upload')
  @ApiOperation({ summary: 'Yangi albom' })
  create(@Body() dto: CreateAlbumDto) {
    return this.gallery.createAlbum(dto);
  }

  @Patch(':id')
  @Permissions('media:upload')
  @ApiOperation({ summary: "Albom nomi yoki tavsifini o'zgartirish" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlbumDto) {
    return this.gallery.updateAlbum(id, dto);
  }

  @Delete(':id')
  @Permissions('media:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Albomni barcha fayllari bilan o'chirish" })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.gallery.removeAlbum(id);
  }

  @Post(':id/images')
  @Permissions('media:upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Rasm yuklash (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  addImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.gallery.addImage(id, file);
  }

  @Post(':id/videos/init')
  @Permissions('media:upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Video yuklash 1-qadam: to'g'ridan-to'g'ri yuklash havolasi" })
  initVideo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InitVideoUploadDto) {
    return this.gallery.initVideoUpload(id, dto);
  }

  @Post(':id/videos/complete')
  @Permissions('media:upload')
  @ApiOperation({ summary: 'Video yuklash 2-qadam: tekshirish va albomga qo‘shish' })
  completeVideo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteVideoUploadDto) {
    return this.gallery.completeVideoUpload(id, dto);
  }

  @Post(':id/items/:itemId/reprocess')
  @Permissions('media:upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Qayta ishlanmay qolgan videoni yana navbatga qo‘yish' })
  reprocessVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.gallery.reprocessVideo(id, itemId);
  }

  @Delete(':id/items/:itemId')
  @Permissions('media:delete')
  @ApiOperation({ summary: "Rasm yoki videoni o'chirish" })
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.gallery.removeItem(id, itemId);
  }
}
