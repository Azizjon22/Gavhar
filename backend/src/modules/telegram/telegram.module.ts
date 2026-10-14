import { Module } from '@nestjs/common';
import { TelegramApi } from './telegram.api';
import { TelegramAuthController, TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

/** Telegram bot va Mini App kirishi. Token bo'lmasa — o'chiq, boshqa modullarga ta'sir qilmaydi. */
@Module({
  controllers: [TelegramController, TelegramAuthController],
  providers: [TelegramApi, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
