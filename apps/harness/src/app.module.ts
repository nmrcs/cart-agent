import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BackendClient } from './backend/backend.client'
import { validateEnv } from './config/env'
import { HealthController } from './health/health.controller'
import { LlmService } from './llm/llm.service'
import { ConversationStore } from './turns/conversation.store'
import { TurnsController } from './turns/turns.controller'
import { TurnsService } from './turns/turns.service'

@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
	controllers: [HealthController, TurnsController],
	providers: [LlmService, BackendClient, ConversationStore, TurnsService],
})
export class AppModule {}
