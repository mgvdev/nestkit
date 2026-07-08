import type { LoggerService } from '@ex/logger'
import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
  // Constructor injection relies on emitted decorator metadata (via SWC).
  constructor(private readonly logger: LoggerService) {}

  @Get()
  index(): { message: string } {
    return { message: this.logger.greet('nestkit') }
  }
}
