import { z } from 'zod'

const envSchema = z.object({
	DATABASE_URL: z
		.string()
		.url()
		.regex(/^postgres(ql)?:\/\//),
	PORT: z.coerce.number().default(3001),
	FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
	// The browser never calls the harness; the backend forwards turns to it.
	HARNESS_URL: z.string().url().default('http://localhost:3002'),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
	return envSchema.parse(config)
}
