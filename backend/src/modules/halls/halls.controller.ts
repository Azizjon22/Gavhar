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
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import { CreateHallDto, ListHallsDto, ReorderHallImagesDto, UpdateHallDto } from './dto/hall.dto';
import { HallsService } from './halls.service';

@ApiTags('Zallar')
@ApiBearerAuth()
@Controller('halls')
export class HallsController {
  constructor(private readonly hallsService: HallsService) {}

  @Get()
  @Permissions('halls:read')
  @ApiOperation({ summary: "Zallar ro'yxati" })
  list(@Query() query: ListHallsDto) {
    return this.hallsService.list(query);
  }

  @Post()
  @Permissions('halls:create')
  @ApiOperation({ summary: 'Yangi zal' })
  create(@Body() dto: CreateHallDto) {
    return this.hallsService.create(dto);
  }

  @Get(':id')
  @Permissions('halls:read')
  @ApiOperation({ summary: 'Bitta zal' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.hallsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('halls:update')
  @ApiOperation({ summary: "Zal ma'lumotlari yoki holatini o'zgartirish" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHallDto) {
    return this.hallsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('halls:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Zalni o'chirish (soft delete)" })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.hallsService.remove(id);
  }

  @Post(':id/images')
  @Permissions('halls:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Rasm yuklash (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  addImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.hallsService.addImage(id, file);
  }

  @Put(':id/images/order')
  @Permissions('halls:update')
  @ApiOperation({ summary: 'Rasmlar tartibi (birinchisi — muqova)' })
  reorderImages(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderHallImagesDto) {
    return this.hallsService.reorderImages(id, dto);
  }

  @Delete(':id/images/:imageId')
  @Permissions('halls:update')
  @ApiOperation({ summary: "Rasmni o'chirish" })
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.hallsService.removeImage(id, imageId);
  }
}
