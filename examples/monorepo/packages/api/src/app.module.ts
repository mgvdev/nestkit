import { LoggerService } from '@ex/logger'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller'

@Module({
  controllers: [AppController],
  providers: [LoggerService],
})
export class AppModule {}
