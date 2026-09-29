import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AssistantModule } from './assistant/assistant.module'
import { CartsModule } from './carts/carts.module'
import { CatalogModule } from './catalog/catalog.module'
import { validateEnv } from './config/env'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
		PrismaModule,
		CatalogModule,
		CartsModule,
		AssistantModule,
	],
	controllers: [HealthController],
})
export class AppModule {}
