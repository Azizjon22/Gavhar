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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import {
  CreateMenuCategoryDto,
  CreateMenuPackageDto,
  ReorderDto,
  UpdateMenuCategoryDto,
  UpdateMenuPackageDto,
} from './dto/menu.dto';
import { MenuService } from './menu.service';

@ApiTags('Menyu')
@ApiBearerAuth()
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get('categories')
  @Permissions('menu:read')
  @ApiOperation({ summary: "Menyu bo'limlari" })
  listCategories() {
    return this.menu.listCategories();
  }

  @Post('categories')
  @Permissions('menu:create')
  @ApiOperation({ summary: "Yangi bo'lim" })
  createCategory(@Body() dto: CreateMenuCategoryDto) {
    return this.menu.createCategory(dto);
  }

  @Put('categories/order')
  @Permissions('menu:update')
  @ApiOperation({ summary: "Bo'limlar tartibi" })
  reorderCategories(@Body() dto: ReorderDto) {
    return this.menu.reorderCategories(dto.ids);
  }

  @Patch('categories/:id')
  @Permissions('menu:update')
  @ApiOperation({ summary: "Bo'lim nomini o'zgartirish" })
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMenuCategoryDto) {
    return this.menu.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Permissions('menu:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Bo'limni o'chirish (paketlar tarkibidan ham chiqadi)" })
  async removeCategory(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.menu.removeCategory(id);
  }

  @Get('packages')
  @Permissions('menu:read')
  @ApiOperation({ summary: 'Menyu paketlari (tarkibi bilan)' })
  listPackages() {
    return this.menu.listPackages();
  }

  @Post('packages')
  @Permissions('menu:create')
  @ApiOperation({ summary: 'Yangi paket' })
  createPackage(@Body() dto: CreateMenuPackageDto) {
    return this.menu.createPackage(dto);
  }

  @Put('packages/order')
  @Permissions('menu:update')
  @ApiOperation({ summary: 'Paketlar tartibi' })
  reorderPackages(@Body() dto: ReorderDto) {
    return this.menu.reorderPackages(dto.ids);
  }

  @Patch('packages/:id')
  @Permissions('menu:update')
  @ApiOperation({ summary: "Paket narxi yoki tarkibini o'zgartirish" })
  updatePackage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMenuPackageDto) {
    return this.menu.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  @Permissions('menu:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Paketni o'chirish (eski bronlarda nomi saqlanadi)" })
  async removePackage(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.menu.removePackage(id);
  }

  @Post('packages/:id/cover')
  @Permissions('menu:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Paket muqova rasmi (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  setPackageCover(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.menu.setPackageCover(id, file);
  }

  @Delete('packages/:id/cover')
  @Permissions('menu:update')
  @ApiOperation({ summary: 'Paket muqova rasmini olib tashlash' })
  removePackageCover(@Param('id', ParseUUIDPipe) id: string) {
    return this.menu.removePackageCover(id);
  }

  @Get('packages/:id/prices')
  @Permissions('menu:read')
  @ApiOperation({ summary: 'Paket narxi tarixi' })
  priceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.menu.priceHistory(id);
  }
}
