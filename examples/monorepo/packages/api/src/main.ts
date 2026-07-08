import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  const port = Number(process.env.PORT ?? 3100)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`)
}

bootstrap()
