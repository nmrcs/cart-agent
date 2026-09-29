import { Module } from '@nestjs/common'
import { CartsModule } from '../carts/carts.module'
import { AssistantController } from './assistant.controller'
import { HarnessClient } from './harness.client'

@Module({
	imports: [CartsModule],
	controllers: [AssistantController],
	providers: [HarnessClient],
})
export class AssistantModule {}
