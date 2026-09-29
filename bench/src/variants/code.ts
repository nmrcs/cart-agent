import type { TurnResponse } from '@cart-agent/contracts'
import type { Agent, AgentTurn } from '../agent'
import { TODAY } from '../personas'

// The harness as it ships: the model reads, ranks and words the reply, code
// filters the catalog, fits the budget and prices through the backend.
export class CodeAgent implements Agent {
	private conversationId: string | undefined

	constructor(private readonly harness: string) {}

	async turn(message: string): Promise<AgentTurn> {
		const start = performance.now()
		const res = await fetch(`${this.harness}/turns`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				conversationId: this.conversationId,
				message,
				today: TODAY,
			}),
		})
		if (!res.ok) throw new Error(`harness ${res.status}: ${await res.text()}`)
		const t = (await res.json()) as TurnResponse
		this.conversationId = t.conversationId
		const proposal = t.proposal?.lines.length
			? t.proposal.lines.map((l) => ({
					slug: l.product.slug,
					quantity: l.quantity,
				}))
			: null
		return {
			reply: t.reply,
			proposal,
			committed: t.applyProposal || t.cartSet.length ? proposal : null,
			usage: t.usage,
			ms: Math.round(performance.now() - start),
		}
	}
}
