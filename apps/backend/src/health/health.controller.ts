import { Controller, Get } from '@nestjs/common'
import type { HealthResponse } from '@cart-agent/contracts'

@Controller('health')
export class HealthController {
	@Get()
	health(): HealthResponse {
		return { status: 'ok', service: 'backend' }
	}
}
