import type { Candidate, Profile, Quote } from '@cart-agent/contracts'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { ChatMessage } from '../llm/llm.service'
import { EMPTY_PROFILE } from '../profile/gift.profile'
import type { Line } from './proposal'

export type Conversation = {
	id: string
	profile: Profile
	lines: Line[]
	quote: Quote | null
	// What this conversation has put in the cart, by words or the button.
	// A later edit in words to these items changes the cart too.
	inCart: Line[]
	alternatives: Candidate[]
	// Products the buyer took out in words: not proposed again in this
	// conversation.
	declined: Set<string>
	// Every product the harness has shown, so a later turn can name it.
	known: Map<string, Candidate>
	reasons: Map<string, string>
	history: ChatMessage[]
	// The date the conversation runs on; quotes judge the birthday against it.
	today: string
	// The slot asked about last. "Any gift will do" is only believed as the
	// answer to the interests question or when the shopper actually says so.
	lastAsked: string | null
	touchedAt: number
}

const TTL_MS = 2 * 60 * 60 * 1000

// In memory on purpose: the harness owns no database. A restart forgets the
// conversations; carts live in the backend and survive.
@Injectable()
export class ConversationStore {
	private readonly items = new Map<string, Conversation>()

	get(id: string | undefined): Conversation {
		this.prune()
		const found = id ? this.items.get(id) : undefined
		if (found) {
			found.touchedAt = Date.now()
			return found
		}
		const fresh: Conversation = {
			id: id ?? randomUUID(),
			profile: { ...EMPTY_PROFILE },
			lines: [],
			quote: null,
			inCart: [],
			alternatives: [],
			declined: new Set(),
			known: new Map(),
			reasons: new Map(),
			history: [],
			lastAsked: null,
			today: '',
			touchedAt: Date.now(),
		}
		this.items.set(fresh.id, fresh)
		return fresh
	}

	// Looks up without starting a conversation.
	find(id: string): Conversation | undefined {
		this.prune()
		return this.items.get(id)
	}

	private prune(): void {
		const cutoff = Date.now() - TTL_MS
		for (const [id, c] of this.items)
			if (c.touchedAt < cutoff) this.items.delete(id)
	}
}
