import type { Cart } from '@cart-agent/contracts'
import { create } from 'zustand'
import { api, ApiError } from '../lib/api'

const STORAGE_KEY = 'cart-agent.cartId'

function readId(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY)
	} catch {
		return null
	}
}

function writeId(id: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, id)
	} catch {
		// Private mode: the cart lives for this tab only.
	}
}

type CartState = {
	cart: Cart | null
	isOpen: boolean
	pending: string | null
	error: string | null
	setOpen: (open: boolean) => void
	load: () => Promise<void>
	setQuantity: (slug: string, quantity: number) => Promise<void>
	ensure: () => Promise<Cart>
	// The cart as the backend returned it after the assistant changed it.
	replace: (cart: Cart) => void
	clearError: () => void
}

// The browser keeps only the cart id. Lines, prices and totals always come
// back from the backend.
export const useCart = create<CartState>((set, get) => {
	async function ensureCart(): Promise<Cart> {
		const existing = get().cart
		if (existing) return existing
		const cart = await api.createCart()
		writeId(cart.id)
		set({ cart })
		return cart
	}

	return {
		cart: null,
		isOpen: false,
		pending: null,
		error: null,
		setOpen: (isOpen) => set({ isOpen }),
		clearError: () => set({ error: null }),
		ensure: ensureCart,
		replace: (cart) => set({ cart }),

		async load() {
			const id = readId()
			if (!id) return
			try {
				set({ cart: await api.cart(id) })
			} catch (e) {
				// A cart that no longer exists (the seed was rerun) is dropped silently.
				if (!(e instanceof ApiError && e.status === 404)) throw e
			}
		},

		async setQuantity(slug, quantity) {
			set({ pending: slug, error: null })
			try {
				const cart = await ensureCart()
				set({ cart: await api.setItem(cart.id, slug, quantity) })
			} catch (e) {
				set({ error: (e as Error).message })
			} finally {
				set({ pending: null })
			}
		},
	}
})

export function useQuantity(slug: string): number {
	return useCart(
		(s) => s.cart?.lines.find((l) => l.product.slug === slug)?.quantity ?? 0,
	)
}
