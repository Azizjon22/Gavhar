import { Module } from '@nestjs/common';
import { ExtraServicesController } from './extra-services.controller';
import { ExtraServicesService } from './extra-services.service';

@Module({
  controllers: [ExtraServicesController],
  providers: [ExtraServicesService],
})
export class ExtraServicesModule {}
