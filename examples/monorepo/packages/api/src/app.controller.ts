import { Controller, Get } from '@nestjs/common'
// Value import (not `import type`): Nest DI needs the class at runtime for decorator metadata.
import { LoggerService } from '@ex/logger'

@Controller()
export class AppController {
  // Constructor injection relies on emitted decorator metadata (via SWC).
  constructor(private readonly logger: LoggerService) {}

  @Get()
  index(): { message: string } {
    return { message: this.logger.greet('nestkit') }
  }
}
