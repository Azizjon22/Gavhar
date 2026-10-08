import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { ShoppingModule } from '@/modules/shopping/shopping.module';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ShoppingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
