import { Module } from '@nestjs/common';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { StockUsageService } from './stock-usage.service';
import { StockUsageController, WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [TelegramModule],
  controllers: [WarehouseController, StockUsageController],
  providers: [WarehouseService, StockUsageService],
  exports: [StockUsageService],
})
export class WarehouseModule {}
