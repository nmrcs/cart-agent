import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common'
import {
	birthdayDiscount,
	type Cart,
	localToday,
	type Quote,
	type QuoteRequest,
} from '@cart-agent/contracts'
import { summaryInclude, toSummary } from '../catalog/product-view'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CartsService {
	constructor(private readonly prisma: PrismaService) {}

	async create(): Promise<Cart> {
		const cart = await this.prisma.cart.create({ data: {} })
		return this.view(cart.id)
	}

	async view(id: string): Promise<Cart> {
		const cart = await this.prisma.cart.findUnique({
			where: { id },
			include: {
				items: {
					include: { product: { include: summaryInclude } },
					orderBy: { addedAt: 'asc' },
				},
			},
		})
		if (!cart) throw new NotFoundException('cart not found')
		// Every total is computed here from the current price. Nothing a client
		// or the assistant sends can set it.
		const lines = cart.items.map((item) => ({
			product: toSummary(item.product),
			quantity: item.quantity,
			lineTotalCents: item.product.priceCents * item.quantity,
		}))
		const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
		const birthdayOn = cart.birthdayOn?.toISOString().slice(0, 10) ?? null
		const discount = birthdayDiscount(subtotalCents, localToday(), birthdayOn)
		return {
			id: cart.id,
			lines,
			itemCount: lines.reduce((n, l) => n + l.quantity, 0),
			subtotalCents,
			discount,
			totalCents: subtotalCents - (discount?.amountCents ?? 0),
			birthdayOn,
		}
	}

	async setItem(cartId: string, slug: string, quantity: number): Promise<Cart> {
		const [cart, product] = await Promise.all([
			this.prisma.cart.findUnique({ where: { id: cartId } }),
			this.prisma.product.findUnique({ where: { slug } }),
		])
		if (!cart) throw new NotFoundException('cart not found')
		if (!product) throw new NotFoundException('product not found')

		const key = { cartId_productId: { cartId, productId: product.id } }
		if (quantity === 0) {
			await this.prisma.cartItem.deleteMany({
				where: { cartId, productId: product.id },
			})
			return this.view(cartId)
		}
		if (quantity > product.stock) {
			throw new ConflictException({
				code: 'insufficient_stock',
				message:
					product.stock === 0
						? `${product.name} is out of stock`
						: `Only ${product.stock} of ${product.name} left`,
				available: product.stock,
			})
		}
		await this.prisma.cartItem.upsert({
			where: key,
			create: { cartId, productId: product.id, quantity },
			update: { quantity },
		})
		return this.view(cartId)
	}

	// Puts an accepted proposal in the cart. Accepting twice does not double a
	// line, and quantities are capped by stock. Prices are never read from it.
	async applyLines(
		cartId: string,
		lines: { slug: string; quantity: number }[],
		birthdayOn?: string | null,
	): Promise<Cart> {
		const cart = await this.prisma.cart.findUnique({
			where: { id: cartId },
			include: { items: true },
		})
		if (!cart) throw new NotFoundException('cart not found')
		const products = await this.prisma.product.findMany({
			where: { slug: { in: lines.map((l) => l.slug) } },
		})
		const bySlug = new Map(products.map((p) => [p.slug, p]))
		await this.prisma.$transaction(
			lines.flatMap(({ slug, quantity }) => {
				const p = bySlug.get(slug)
				if (!p || p.stock === 0) return []
				const had = cart.items.find((i) => i.productId === p.id)?.quantity ?? 0
				const next = Math.min(p.stock, Math.max(had, quantity))
				return [
					this.prisma.cartItem.upsert({
						where: { cartId_productId: { cartId, productId: p.id } },
						create: { cartId, productId: p.id, quantity: next },
						update: { quantity: next },
					}),
				]
			}),
		)
		// The date is the buyer's word, like their budget. Whether it earns a
		// discount is decided on every view by the shop's rule.
		if (birthdayOn)
			await this.prisma.cart.update({
				where: { id: cartId },
				data: { birthdayOn: new Date(`${birthdayOn}T00:00:00Z`) },
			})
		return this.view(cartId)
	}

	// Sets quantities the shopper changed in words for items the assistant
	// put in the cart. 0 removes the line; a quantity is capped by stock.
	async setLines(
		cartId: string,
		lines: { slug: string; quantity: number }[],
	): Promise<Cart> {
		const products = await this.prisma.product.findMany({
			where: { slug: { in: lines.map((l) => l.slug) } },
		})
		const bySlug = new Map(products.map((p) => [p.slug, p]))
		await this.prisma.$transaction(
			lines.flatMap(({ slug, quantity }) => {
				const p = bySlug.get(slug)
				if (!p) return []
				const next = Math.min(p.stock, quantity)
				return [
					next === 0
						? this.prisma.cartItem.deleteMany({
								where: { cartId, productId: p.id },
							})
						: this.prisma.cartItem.upsert({
								where: { cartId_productId: { cartId, productId: p.id } },
								create: { cartId, productId: p.id, quantity: next },
								update: { quantity: next },
							}),
				]
			}),
		)
		return this.view(cartId)
	}

	// Prices lines the harness proposes, from the catalog, without writing
	// anything. A line that cannot be bought comes back as a problem, not as a
	// silently dropped item.
	async quote(req: QuoteRequest): Promise<Quote> {
		const products = await this.prisma.product.findMany({
			where: { slug: { in: req.lines.map((l) => l.slug) } },
			include: summaryInclude,
		})
		const bySlug = new Map(products.map((p) => [p.slug, p]))
		const lines: Quote['lines'] = []
		const problems: Quote['problems'] = []
		for (const { slug, quantity } of req.lines) {
			const p = bySlug.get(slug)
			if (!p) {
				problems.push({ slug, code: 'not_found', available: 0 })
				continue
			}
			if (quantity > p.stock) {
				problems.push({ slug, code: 'insufficient_stock', available: p.stock })
				continue
			}
			lines.push({
				product: toSummary(p),
				quantity,
				lineTotalCents: p.priceCents * quantity,
			})
		}
		const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
		const discount = birthdayDiscount(
			subtotalCents,
			req.today ?? localToday(),
			req.birthdayOn,
		)
		return {
			lines,
			subtotalCents,
			discount,
			totalCents: subtotalCents - (discount?.amountCents ?? 0),
			problems,
		}
	}
}
