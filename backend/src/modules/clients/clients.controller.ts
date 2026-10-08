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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto, ListClientsDto, UpdateClientDto } from './dto/client.dto';

@ApiTags('Mijozlar')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Permissions('clients:read')
  @ApiOperation({ summary: "Mijozlar ro'yxati (ism yoki telefon bo'yicha qidiruv)" })
  list(@Query() query: ListClientsDto) {
    return this.clientsService.list(query);
  }

  @Post()
  @Permissions('clients:create')
  @ApiOperation({ summary: 'Yangi mijoz' })
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Get(':id')
  @Permissions('clients:read')
  @ApiOperation({ summary: "Bitta mijoz: ma'lumotlari, bronlar soni va qarzdorligi" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOneWithStats(id);
  }

  @Patch(':id')
  @Permissions('clients:update')
  @ApiOperation({ summary: "Mijoz ma'lumotlarini o'zgartirish" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('clients:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mijozni o'chirish (soft delete)" })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.clientsService.remove(id);
  }
}
