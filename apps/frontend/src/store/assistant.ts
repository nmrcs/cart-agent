import type { ProductSummary, Promotion, Quote } from '@cart-agent/contracts'
import { create } from 'zustand'
import { api } from '../lib/api'
import { useCart } from './cart'

const CHAT_KEY = 'cart-agent.chat'
const OPEN_KEY = 'cart-agent.chatOpen'

export type Proposal = {
	quote: Quote
	remainderCents: number | null
	budgetCents: number | null
	notIncluded: ProductSummary[]
	applied: boolean
}

export type Message =
	| { id: string; role: 'user'; text: string }
	| {
			id: string
			role: 'assistant'
			text: string
			proposal: Proposal | null
			// The discount card, on the reply where the discount first applies.
			promotion?: Promotion | null
	  }
	| { id: string; role: 'notice'; text: string }

type Saved = {
	conversationId: string | null
	messages: Message[]
	// The harness's proposal after the last turn, empty when there is none.
	// A card is shown only when it changes: the same gift proposed again
	// after the proposal was emptied gets a card again.
	proposalKey: string
	// The discount last shown, so its card appears once, not under every reply.
	promotionKey: string
}

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key)
		return raw === null ? fallback : (JSON.parse(raw) as T)
	} catch {
		return fallback
	}
}

function write(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Private mode: the conversation lasts as long as the tab.
	}
}

// Open by default where the chat fits beside the catalog.
const wide =
	typeof window !== 'undefined' &&
	window.matchMedia('(min-width: 1024px)').matches

type AssistantState = Saved & {
	isOpen: boolean
	// The step the assistant is on while a turn runs, null when idle.
	step: string | null
	startedAt: number | null
	error: string | null
	applying: string | null
	setOpen: (open: boolean) => void
	send: (text: string) => Promise<void>
	apply: (messageId: string) => Promise<void>
	reset: () => void
}

const id = () => Math.random().toString(36).slice(2, 10)

function proposalKey(q: Quote | null): string {
	return (q?.lines ?? [])
		.map((l) => `${l.product.slug}:${l.quantity}`)
		.join(',')
}

// The last proposal card shown, so an unchanged proposal is not repeated
// under every reply.
function lastProposal(messages: Message[]): Proposal | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]
		if (m.role === 'assistant' && m.proposal) return m.proposal
	}
	return null
}

export const useAssistant = create<AssistantState>((set, get) => {
	const stored = read<Partial<Saved>>(CHAT_KEY, {})
	const messages = stored.messages ?? []
	const saved: Saved = {
		conversationId: stored.conversationId ?? null,
		messages,
		proposalKey:
			stored.proposalKey ?? proposalKey(lastProposal(messages)?.quote ?? null),
		promotionKey: stored.promotionKey ?? '',
	}
	const save = () => {
		const { conversationId, messages, proposalKey, promotionKey } = get()
		write(CHAT_KEY, { conversationId, messages, proposalKey, promotionKey })
	}

	return {
		...saved,
		isOpen: read(OPEN_KEY, wide),
		step: null,
		startedAt: null,
		error: null,
		applying: null,

		setOpen(isOpen) {
			write(OPEN_KEY, isOpen)
			set({ isOpen })
		},

		async send(text) {
			const message = text.trim()
			if (!message || get().step) return
			const sentId = get().conversationId
			set((s) => ({
				messages: [...s.messages, { id: id(), role: 'user', text: message }],
				step: 'send',
				startedAt: Date.now(),
				error: null,
			}))
			save()
			try {
				const cart = await useCart.getState().ensure()
				await api.assistantTurn(
					{ cartId: cart.id, conversationId: sentId ?? undefined, message },
					(e) => {
						if (e.type === 'step') set({ step: e.step })
						else if (e.type === 'error') set({ error: e.message })
						else {
							const { turn } = e
							if (e.cart) useCart.getState().replace(e.cart)
							const previous = lastProposal(get().messages)
							const key = proposalKey(turn.proposal)
							const changed = key !== '' && key !== get().proposalKey
							const promo = turn.promotion
								? `${turn.promotion.birthdayOn}:${turn.promotion.percent}`
								: ''
							const newPromotion = promo !== '' && promo !== get().promotionKey
							const notices: Message[] =
								sentId && turn.fresh
									? [
											{
												id: id(),
												role: 'notice',
												text: 'The assistant restarted and lost the earlier conversation. It starts over from your last message.',
											},
										]
									: []
							set((s) => ({
								conversationId: turn.conversationId,
								proposalKey: key,
								promotionKey: promo,
								messages: [
									// Agreed in words: the card already on screen is now in the cart.
									...s.messages.map((m) =>
										turn.applyProposal &&
										m.role === 'assistant' &&
										m.proposal === previous &&
										previous
											? { ...m, proposal: { ...previous, applied: true } }
											: m,
									),
									...notices,
									{
										id: id(),
										role: 'assistant',
										text: turn.reply,
										promotion: newPromotion ? turn.promotion : null,
										proposal: changed
											? {
													quote: turn.proposal!,
													remainderCents: turn.remainderCents,
													budgetCents: turn.profile.budgetCents,
													notIncluded: turn.notIncluded,
													// An edit in words to what is in the cart
													// is made in the cart as well.
													applied:
														turn.applyProposal || turn.cartSet.length > 0,
												}
											: null,
									},
								],
							}))
						}
					},
				)
			} catch (e) {
				set({ error: (e as Error).message })
			} finally {
				set({ step: null, startedAt: null })
				save()
			}
		},

		async apply(messageId) {
			const { conversationId } = get()
			if (!conversationId) return
			set({ applying: messageId, error: null })
			try {
				const cart = await useCart.getState().ensure()
				useCart
					.getState()
					.replace(await api.applyProposal(cart.id, conversationId))
				set((s) => ({
					messages: s.messages.map((m) =>
						m.id === messageId && m.role === 'assistant' && m.proposal
							? { ...m, proposal: { ...m.proposal, applied: true } }
							: m,
					),
				}))
				save()
			} catch (e) {
				set({ error: (e as Error).message })
			} finally {
				set({ applying: null })
			}
		},

		reset() {
			set({
				conversationId: null,
				messages: [],
				proposalKey: '',
				promotionKey: '',
				error: null,
			})
			save()
		},
	}
})
