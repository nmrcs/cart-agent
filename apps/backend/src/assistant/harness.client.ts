import {
	type ProposalLines,
	type TurnEvent,
	type TurnRequest,
} from '@cart-agent/contracts'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env'

// The backend is the storefront's only entry point. The harness sits behind
// it: it gets the conversation, never the cart.
@Injectable()
export class HarnessClient {
	private readonly base: string

	constructor(config: ConfigService<Env, true>) {
		this.base = config.get('HARNESS_URL', { infer: true }).replace(/\/$/, '')
	}

	// Yields the harness's events as they arrive.
	async *turn(req: TurnRequest): AsyncGenerator<TurnEvent> {
		const res = await fetch(`${this.base}/turns/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
		})
		if (!res.ok || !res.body) throw new Error(`harness ${res.status}`)
		const decoder = new TextDecoder()
		let buffer = ''
		for await (const chunk of res.body) {
			buffer += decoder.decode(chunk, { stream: true })
			let nl: number
			while ((nl = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, nl).trim()
				buffer = buffer.slice(nl + 1)
				if (line) yield JSON.parse(line) as TurnEvent
			}
		}
	}

	// The harness's proposal, marked as put in the cart.
	async applied(conversationId: string): Promise<ProposalLines> {
		const res = await fetch(
			`${this.base}/conversations/${conversationId}/proposal/applied`,
			{ method: 'POST' },
		)
		if (res.status === 404)
			throw new NotFoundException(
				'The assistant no longer has this conversation',
			)
		if (!res.ok) throw new Error(`harness ${res.status}`)
		return (await res.json()) as ProposalLines
	}
}
