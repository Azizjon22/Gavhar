import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { SuperAdminOnly } from '@/common/decorators/super-admin-only.decorator';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import { BrandNameDto } from './dto/brand.dto';
import { SettingsService } from './settings.service';

@ApiTags('Sozlamalar')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('brand')
  @Public()
  @ApiOperation({ summary: 'Brend: nom va logotip (kirish sahifasi uchun ochiq)' })
  getBrand() {
    return this.settingsService.getBrand();
  }

  @Put('brand')
  @SuperAdminOnly()
  @ApiOperation({ summary: 'Brend nomini o‘zgartirish (SUPER_ADMIN)' })
  updateBrand(@Body() dto: BrandNameDto) {
    return this.settingsService.updateBrandName(dto.name);
  }

  @Post('brand/logo')
  @SuperAdminOnly()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Logotip yuklash (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  setBrandLogo(@UploadedFile() file?: Express.Multer.File) {
    return this.settingsService.setBrandLogo(file);
  }

  @Delete('brand/logo')
  @SuperAdminOnly()
  @ApiOperation({ summary: 'Logotipni olib tashlash' })
  removeBrandLogo() {
    return this.settingsService.removeBrandLogo();
  }
}
