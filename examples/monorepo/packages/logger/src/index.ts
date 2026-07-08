import { Injectable } from '@nestjs/common'

/** A trivial injectable so we exercise Nest DI + decorator metadata through SWC. */
@Injectable()
export class LoggerService {
  greet(name: string): string {
    return `[logger] hello, ${name}`
  }
}
