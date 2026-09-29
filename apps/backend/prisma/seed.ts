import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { categories, products, tags } from './catalog'

// Five shots per product: the main square image and four thumbnails. Files
// live at the frontend's /products/<slug>/<n>.jpg; the alt text is the brief
// for each photo.
const shots = [
	(name: string) => `${name}, front view on a light background`,
	(name: string) => `${name} in use`,
	(name: string) => `${name}, close-up of the details`,
	(name: string) => `${name}, everything that comes in the box`,
	(name: string) => `${name} next to a hand for scale`,
]

async function main(): Promise<void> {
	const prisma = new PrismaClient({
		adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
	})

	// The seed owns the whole catalog, so a rerun starts from empty.
	await prisma.$transaction([
		prisma.cartItem.deleteMany(),
		prisma.cart.deleteMany(),
		prisma.productImage.deleteMany(),
		prisma.product.deleteMany(),
		prisma.tag.deleteMany(),
		prisma.category.deleteMany(),
	])

	const categoryIds = new Map<string, string>()
	for (const [position, c] of categories.entries()) {
		const row = await prisma.category.create({ data: { ...c, position } })
		categoryIds.set(c.slug, row.id)
	}

	for (const [slug, name] of Object.entries(tags)) {
		await prisma.tag.create({ data: { slug, name } })
	}

	for (const p of products) {
		const categoryId = categoryIds.get(p.category)
		if (!categoryId)
			throw new Error(`${p.slug}: unknown category ${p.category}`)
		await prisma.product.create({
			data: {
				slug: p.slug,
				name: p.name,
				description: p.description,
				priceCents: p.priceCents,
				stock: p.stock,
				ageMin: p.ageMin,
				ageMax: p.ageMax,
				deliveryDays: p.deliveryDays,
				categoryId,
				tags: { connect: p.tags.map((slug) => ({ slug })) },
				images: {
					create: shots.map((alt, position) => ({
						url: `/products/${p.slug}/${position + 1}.jpg`,
						alt: alt(p.name),
						position,
					})),
				},
			},
		})
	}

	// Second pass: a product can require one seeded after it.
	for (const p of products) {
		if (!p.requires?.length) continue
		await prisma.product.update({
			where: { slug: p.slug },
			data: { requires: { connect: p.requires.map((slug) => ({ slug })) } },
		})
	}

	const [c, t, n, i] = await Promise.all([
		prisma.category.count(),
		prisma.tag.count(),
		prisma.product.count(),
		prisma.productImage.count(),
	])
	console.log({ categories: c, tags: t, products: n, images: i })
	await prisma.$disconnect()
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
