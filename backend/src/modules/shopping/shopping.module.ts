import { Module } from '@nestjs/common';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { ShoppingController } from './shopping.controller';
import { ShoppingService } from './shopping.service';

@Module({
  imports: [TelegramModule],
  controllers: [ShoppingController],
  providers: [ShoppingService],
  exports: [ShoppingService],
})
export class ShoppingModule {}
