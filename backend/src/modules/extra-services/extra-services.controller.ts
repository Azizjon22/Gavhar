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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { CreateExtraServiceDto, UpdateExtraServiceDto } from './dto/extra-service.dto';
import { ExtraServicesService } from './extra-services.service';

@ApiTags("Qo'shimcha xizmatlar")
@ApiBearerAuth()
@Controller('extra-services')
export class ExtraServicesController {
  constructor(private readonly service: ExtraServicesService) {}

  @Get()
  @Permissions('events:read')
  @ApiOperation({ summary: "Qo'shimcha xizmatlar katalogi" })
  list() {
    return this.service.list();
  }

  @Post()
  @Permissions('events:update')
  @ApiOperation({ summary: 'Yangi xizmat' })
  create(@Body() dto: CreateExtraServiceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('events:update')
  @ApiOperation({ summary: "Xizmatni o'zgartirish yoki o'chirib qo'yish" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExtraServiceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('events:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xizmatni katalogdan olib tashlash' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
