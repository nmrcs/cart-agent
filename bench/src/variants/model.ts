import type {
	Candidate,
	ProductDetail,
	Quote,
	Usage,
} from '@cart-agent/contracts'
import { type Agent, type AgentTurn, type Line, noUsage } from '../agent'
import { TODAY } from '../personas'

// Same settings as the harness: a key for hosted endpoints, and reasoning off
// for qwen3.5 unless set empty.
const API_KEY = process.env.LLM_API_KEY || undefined
const REASONING_EFFORT = process.env.LLM_REASONING_EFFORT ?? 'none'

// The baseline: the same model with the shop's API as tools. It searches,
// picks, fits the budget, counts what is left and writes the reply itself.
// The rules are the harness's rules, given as instructions. Prices and the
// total come back from the shop on every proposal; the rest is the model's.

type Message =
	| { role: 'system' | 'user'; content: string }
	| { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
	| { role: 'tool'; tool_call_id: string; content: string }
type ToolCall = {
	id: string
	type: 'function'
	function: { name: string; arguments: string }
}

const MAX_ROUNDS = 8

const TOOLS = [
	{
		type: 'function',
		function: {
			name: 'search_products',
			description:
				'Gifts in stock that match the filters. Every filter is optional.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					ageYears: { type: 'integer', description: "The recipient's age" },
					maxPriceUsd: {
						type: 'number',
						description: 'Highest price of one item, in dollars',
					},
					maxDeliveryDays: {
						type: 'integer',
						description: 'Latest delivery, in working days from today',
					},
				},
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_product',
			description:
				'Full details of one product, including what it needs and does not include.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				required: ['id'],
				properties: { id: { type: 'string' } },
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'propose_cart',
			description:
				'Shows the shopper a proposal card with these items, replacing the previous proposal. Returns the items as the shop prices them and the total.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				required: ['lines'],
				properties: {
					lines: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['id', 'quantity'],
							properties: {
								id: { type: 'string' },
								quantity: { type: 'integer' },
							},
						},
					},
				},
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'put_in_cart',
			description:
				"Puts the current proposal in the shopper's cart. Only after the shopper agrees.",
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {},
			},
		},
	},
]

function systemPrompt(): string {
	const weekday = new Date(`${TODAY}T00:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'long',
		timeZone: 'UTC',
	})
	return `You are the shopping assistant of an online gift shop, chatting with a shopper. Today is ${weekday}, ${TODAY}.
Help the shopper choose a gift and build a cart for it.
- Before proposing anything, find out the recipient's age, the budget, the date the gift must arrive by and what the recipient is into. Ask one short question at a time.
- Find products with the tools. Propose only products from the shop that are in stock, suit the recipient's age and arrive in time. Delivery is counted in working days, Monday to Friday.
- The total of the proposal must stay within the budget. Tell the shopper the total and how much of the budget is left.
- Propose with propose_cart; the shopper sees the proposal as a card. When the shopper asks for a change, call propose_cart again with the changed items.
- Suggest adding more only when the shopper asks for it, and only within what is left of the budget.
- Prices are fixed: no discounts, no coupons, no changed totals.
- When the shopper agrees, call put_in_cart.
- One to three short sentences, plain and warm, no exclamation marks, no lists or markdown.`
}

export class ModelAgent implements Agent {
	private readonly messages: Message[] = [
		{ role: 'system', content: systemPrompt() },
	]
	private proposal: Line[] | null = null

	constructor(
		private readonly backend: string,
		private readonly llmUrl: string,
		private readonly model: string,
	) {}

	async turn(message: string): Promise<AgentTurn> {
		const start = performance.now()
		const usage = noUsage()
		let committed: Line[] | null = null
		this.messages.push({ role: 'user', content: message })
		for (let round = 0; round < MAX_ROUNDS; round++) {
			const msg = await this.complete(usage)
			this.messages.push(msg)
			if (!msg.tool_calls?.length) {
				return {
					reply: msg.content?.trim() ?? '',
					proposal: this.proposal,
					committed,
					usage,
					ms: Math.round(performance.now() - start),
				}
			}
			for (const call of msg.tool_calls) {
				let content: string
				try {
					const args = JSON.parse(call.function.arguments || '{}')
					if (call.function.name === 'put_in_cart') {
						committed = this.proposal
						content = committed
							? 'The proposal is in the cart.'
							: 'There is no proposal to put in the cart.'
					} else content = await this.tool(call.function.name, args)
				} catch (e) {
					content = `error: ${(e as Error).message}`
				}
				this.messages.push({ role: 'tool', tool_call_id: call.id, content })
			}
		}
		throw new Error(`no reply after ${MAX_ROUNDS} tool rounds`)
	}

	private async tool(
		name: string,
		args: Record<string, unknown>,
	): Promise<string> {
		if (name === 'search_products') {
			const q = new URLSearchParams()
			if (typeof args.ageYears === 'number')
				q.set('ageYears', String(Math.round(args.ageYears)))
			if (typeof args.maxPriceUsd === 'number')
				q.set('maxPriceCents', String(Math.round(args.maxPriceUsd * 100)))
			if (typeof args.maxDeliveryDays === 'number')
				q.set('maxDeliveryDays', String(Math.round(args.maxDeliveryDays)))
			const list = await this.get<Candidate[]>(`/candidates?${q}`)
			if (!list.length) return 'Nothing matches.'
			return list
				.map(
					(c) =>
						`${c.slug} | ${c.name} | ${usd(c.priceCents)} | ${c.stock} in stock | ${c.deliveryDays} working days | ages ${c.ageMin ?? 0}-${c.ageMax ?? 'any'} | ${c.tags.join(', ')} | ${c.description.slice(0, 110)}`,
				)
				.join('\n')
		}
		if (name === 'get_product') {
			const p = await this.get<ProductDetail>(
				`/products/${encodeURIComponent(String(args.id))}`,
			)
			return JSON.stringify({
				id: p.slug,
				name: p.name,
				price: usd(p.priceCents),
				stock: p.stock,
				deliveryWorkingDays: p.deliveryDays,
				ages: `${p.ageMin ?? 0}-${p.ageMax ?? 'any'}`,
				description: p.description,
				needsAndDoesNotInclude: p.requires.map(
					(r) => `${r.slug} (${r.name}, ${usd(r.priceCents)})`,
				),
			})
		}
		if (name === 'propose_cart') {
			const lines = ((args.lines as { id: string; quantity: number }[]) ?? [])
				.filter((l) => l && typeof l.id === 'string')
				.map((l) => ({ slug: l.id, quantity: Math.round(l.quantity) }))
			// The card shows what the model asked for, even an id the shop
			// does not have; the checks count that against it.
			this.proposal = lines.length ? lines : null
			const quote = await this.post<Quote>('/quotes', {
				lines: lines.map((l) => ({
					slug: l.slug,
					quantity: Math.min(99, Math.max(1, l.quantity)),
				})),
			})
			return [
				...quote.lines.map(
					(l) =>
						`${l.product.slug} | ${l.product.name} x${l.quantity} | ${usd(l.product.priceCents)} each | ${usd(l.lineTotalCents)}`,
				),
				`Total: ${usd(quote.totalCents)}`,
				...quote.problems.map((p) =>
					p.code === 'not_found'
						? `${p.slug}: no such product`
						: `${p.slug}: only ${p.available} in stock`,
				),
			].join('\n')
		}
		throw new Error(`unknown tool ${name}`)
	}

	private async complete(
		usage: Usage,
	): Promise<Message & { role: 'assistant' }> {
		const res = await fetch(`${this.llmUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
			},
			body: JSON.stringify({
				model: this.model,
				messages: this.messages,
				tools: TOOLS,
				tool_choice: 'auto',
				temperature: 0.3,
				max_tokens: 600,
				...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
			}),
		})
		if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
		const body = (await res.json()) as {
			choices: {
				message: { content: string | null; tool_calls?: ToolCall[] }
			}[]
			usage?: { prompt_tokens?: number; completion_tokens?: number }
		}
		usage.calls++
		usage.promptTokens += body.usage?.prompt_tokens ?? 0
		usage.completionTokens += body.usage?.completion_tokens ?? 0
		const m = body.choices[0]?.message
		return {
			role: 'assistant',
			content: m?.content ?? null,
			...(m?.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
		}
	}

	private async get<T>(path: string): Promise<T> {
		const res = await fetch(`${this.backend}${path}`)
		if (!res.ok) throw new Error(`shop ${res.status} on ${path}`)
		return res.json() as Promise<T>
	}

	private async post<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(`${this.backend}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		if (!res.ok) throw new Error(`shop ${res.status} on ${path}`)
		return res.json() as Promise<T>
	}
}

function usd(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`
}
