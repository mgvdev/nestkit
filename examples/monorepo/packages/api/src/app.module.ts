import { Module } from '@nestjs/common'
import { LoggerService } from '@ex/logger'
import { AppController } from './app.controller'

@Module({
  controllers: [AppController],
  providers: [LoggerService],
})
export class AppModule {}
