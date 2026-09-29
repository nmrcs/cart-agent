import type { ProductDetail, ProductPage } from '@cart-agent/contracts'

// The ground truth every check is made against: the catalog as the backend
// has it, not as either agent describes it.
export type Catalog = Map<string, ProductDetail>

export async function loadCatalog(backend: string): Promise<Catalog> {
	const all: Catalog = new Map()
	for (let page = 1; ; page++) {
		const list = await get<ProductPage>(
			`${backend}/products?page=${page}&pageSize=48`,
		)
		for (const p of list.items)
			all.set(p.slug, await get<ProductDetail>(`${backend}/products/${p.slug}`))
		if (page * list.pageSize >= list.total) break
	}
	return all
}

async function get<T>(url: string): Promise<T> {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`${res.status} on ${url}`)
	return res.json() as Promise<T>
}

// Delivery is promised in working days: the same rule as the harness uses.
export function workingDaysUntil(today: string, date: string): number {
	const start = Date.parse(`${today}T00:00:00Z`)
	const end = Date.parse(`${date}T00:00:00Z`)
	let days = 0
	for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
		const weekday = new Date(t).getUTCDay()
		if (weekday !== 0 && weekday !== 6) days++
	}
	return days
}
