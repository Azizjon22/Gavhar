import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import { DishesService } from './dishes.service';
import { DishNameDto, SaveDishDto } from './dto/dish.dto';

@ApiTags('Menyu')
@ApiBearerAuth()
@Controller('menu/dishes')
export class DishesController {
  constructor(private readonly service: DishesService) {}

  @Get()
  @Permissions('menu:read')
  @ApiOperation({ summary: 'Taomlar katalogi: paketlardagi nomlar, rasm va tavsifi bilan' })
  list() {
    return this.service.list();
  }

  @Put()
  @Permissions('menu:update')
  @ApiOperation({ summary: 'Taom tavsifini saqlash (nomi bo‘yicha)' })
  save(@Body() dto: SaveDishDto) {
    return this.service.save(dto.name, dto.description || null);
  }

  @Post('photo')
  @Permissions('menu:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Taom rasmi (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  setPhoto(@Query() query: DishNameDto, @UploadedFile() file?: Express.Multer.File) {
    return this.service.setPhoto(query.name, file);
  }

  @Delete('photo')
  @Permissions('menu:update')
  @ApiOperation({ summary: 'Taom rasmini olib tashlash' })
  removePhoto(@Query() query: DishNameDto) {
    return this.service.removePhoto(query.name);
  }
}
