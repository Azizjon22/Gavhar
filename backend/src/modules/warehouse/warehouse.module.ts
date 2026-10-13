import { Module } from '@nestjs/common';
import { StockUsageService } from './stock-usage.service';
import { StockUsageController, WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  controllers: [WarehouseController, StockUsageController],
  providers: [WarehouseService, StockUsageService],
  exports: [StockUsageService],
})
export class WarehouseModule {}
