import type {
	AssistantEvent,
	AssistantTurnRequest,
	Cart,
	Category,
	ProductDetail,
	ProductPage,
} from '@cart-agent/contracts'

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code?: string,
	) {
		super(message)
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await send(path, init)
	return res.json() as Promise<T>
}

async function send(path: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers },
	})
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as {
			message?: unknown
			code?: string
		} | null
		const message =
			typeof body?.message === 'string' ? body.message : res.statusText
		throw new ApiError(res.status, message, body?.code)
	}
	return res
}

// A turn comes back as newline-delimited events: the steps while the
// assistant works, then the turn.
async function assistantTurn(
	req: AssistantTurnRequest,
	onEvent: (e: AssistantEvent) => void,
): Promise<void> {
	const res = await send('/assistant/turns', {
		method: 'POST',
		body: JSON.stringify(req),
	})
	const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
	let buffer = ''
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += value
		let nl: number
		while ((nl = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, nl).trim()
			buffer = buffer.slice(nl + 1)
			if (line) onEvent(JSON.parse(line) as AssistantEvent)
		}
	}
}

export const api = {
	categories: () => request<Category[]>('/categories'),
	products: (params: { category?: string; page: number; pageSize: number }) => {
		const q = new URLSearchParams({
			page: String(params.page),
			pageSize: String(params.pageSize),
		})
		if (params.category) q.set('category', params.category)
		return request<ProductPage>(`/products?${q}`)
	},
	product: (slug: string) =>
		request<ProductDetail>(`/products/${encodeURIComponent(slug)}`),
	createCart: () => request<Cart>('/carts', { method: 'POST' }),
	cart: (id: string) => request<Cart>(`/carts/${id}`),
	setItem: (id: string, slug: string, quantity: number) =>
		request<Cart>(`/carts/${id}/items/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			body: JSON.stringify({ quantity }),
		}),
	assistantTurn,
	applyProposal: (cartId: string, conversationId: string) =>
		request<Cart>('/assistant/proposal/apply', {
			method: 'POST',
			body: JSON.stringify({ cartId, conversationId }),
		}),
}
