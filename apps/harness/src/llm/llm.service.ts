import type { Usage } from '@cart-agent/contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Env } from '../config/env'

export type ChatMessage = {
	role: 'system' | 'user' | 'assistant'
	content: string
}

type Options = { temperature?: number; maxTokens?: number }

// Two calls only: a JSON answer shaped by a schema, or plain text. The model
// never gets tools; the harness decides what to fetch and what to do.
@Injectable()
export class LlmService {
	private readonly url: string
	private readonly model: string
	private readonly apiKey: string | undefined
	private readonly reasoningEffort: string
	// Per turn, not per process: two conversations can be mid-turn at once.
	private readonly meter = new AsyncLocalStorage<Usage>()

	constructor(config: ConfigService<Env, true>) {
		this.url = config.get('LLM_URL', { infer: true }).replace(/\/$/, '')
		this.model = config.get('LLM_MODEL', { infer: true })
		this.apiKey = config.get('LLM_API_KEY', { infer: true }) || undefined
		this.reasoningEffort = config.get('LLM_REASONING_EFFORT', { infer: true })
	}

	// Counts every model call made inside fn.
	async metered<T>(fn: () => Promise<T>): Promise<{ value: T; usage: Usage }> {
		const usage: Usage = { calls: 0, promptTokens: 0, completionTokens: 0 }
		const value = await this.meter.run(usage, fn)
		return { value, usage }
	}

	async json<T>(
		name: string,
		schema: object,
		messages: ChatMessage[],
		opts: Options = {},
	): Promise<T> {
		const content = await this.complete(messages, opts, {
			type: 'json_schema',
			json_schema: { name, strict: true, schema },
		})
		return JSON.parse(content) as T
	}

	text(messages: ChatMessage[], opts: Options = {}): Promise<string> {
		return this.complete(messages, opts)
	}

	private async complete(
		messages: ChatMessage[],
		opts: Options,
		responseFormat?: object,
	): Promise<string> {
		const res = await fetch(`${this.url}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
			},
			body: JSON.stringify({
				model: this.model,
				messages,
				temperature: opts.temperature ?? 0.1,
				max_tokens: opts.maxTokens ?? 400,
				...(this.reasoningEffort
					? { reasoning_effort: this.reasoningEffort }
					: {}),
				...(responseFormat ? { response_format: responseFormat } : {}),
			}),
		})
		if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
		const body = (await res.json()) as {
			choices: { message: { content: string | null } }[]
			usage?: { prompt_tokens?: number; completion_tokens?: number }
		}
		const usage = this.meter.getStore()
		if (usage) {
			usage.calls++
			usage.promptTokens += body.usage?.prompt_tokens ?? 0
			usage.completionTokens += body.usage?.completion_tokens ?? 0
		}
		return body.choices[0]?.message.content?.trim() ?? ''
	}
}
