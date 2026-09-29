import type { Usage } from '@cart-agent/contracts'

export type Line = { slug: string; quantity: number }

// What the buyer sees after one turn, the same for both variants.
export type AgentTurn = {
	reply: string
	// The proposal card after this turn; null when there is none.
	proposal: Line[] | null
	// What went into the cart on this turn, if anything.
	committed: Line[] | null
	usage: Usage
	ms: number
}

export interface Agent {
	turn(message: string): Promise<AgentTurn>
}

export const noUsage = (): Usage => ({
	calls: 0,
	promptTokens: 0,
	completionTokens: 0,
})
