import { Module } from '@nestjs/common';
import { DishesController } from './dishes.controller';
import { DishesService } from './dishes.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  controllers: [MenuController, DishesController],
  providers: [MenuService, DishesService],
  exports: [MenuService],
})
export class MenuModule {}
