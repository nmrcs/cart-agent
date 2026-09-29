import { z } from 'zod'

const envSchema = z.object({
	PORT: z.coerce.number().default(3002),
	BACKEND_URL: z.string().url().default('http://localhost:3001'),
	// Any OpenAI-compatible endpoint; LM Studio on this machine by default.
	LLM_URL: z.string().url().default('http://127.0.0.1:1234/v1'),
	LLM_MODEL: z.string().default('qwen/qwen3.5-9b'),
	// Sent as a bearer token when set: OpenAI, OpenRouter and other hosted
	// endpoints need one, LM Studio does not.
	LLM_API_KEY: z.string().optional(),
	// qwen3.5 in LM Studio spends the whole token budget on reasoning without
	// 'none'. Some hosted models reject the parameter: set it empty to omit it.
	LLM_REASONING_EFFORT: z.string().default('none'),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
	return envSchema.parse(config)
}
