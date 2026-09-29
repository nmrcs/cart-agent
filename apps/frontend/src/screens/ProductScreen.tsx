import type { ProductDetail } from '@cart-agent/contracts'
import { Breadcrumbs, Button, Chip, EmptyState, Skeleton } from '@heroui/react'
import { IconChevronLeft, IconChevronRight } from '@heroui/react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AddToCart } from '../components/AddToCart'
import { Availability } from '../components/Availability'
import { AgeIcon, PlugIcon, TruckIcon } from '../components/Icons'
import { ProductImage } from '../components/ProductImage'
import { api } from '../lib/api'
import { money } from '../lib/money'
import { ageLabel, deliveryLabel } from '../lib/product-facts'
import { useResource } from '../lib/use-resource'

export function ProductScreen() {
	const { slug = '' } = useParams()
	const { data, error, loading, retry } = useResource(slug, () =>
		api.product(slug),
	)

	if (error) {
		return (
			<EmptyState className="flex flex-col items-center gap-4 py-32 text-center">
				<p className="font-display text-2xl">
					{error.message === 'product not found'
						? 'This item is not in the catalog'
						: 'The item did not load'}
				</p>
				<div className="flex gap-3">
					<Button variant="secondary" onPress={retry}>
						Try again
					</Button>
					<Link to="/" className="button button--primary button--md">
						Back to the catalog
					</Link>
				</div>
			</EmptyState>
		)
	}
	if (!data || loading) return <ProductSkeleton />
	// Keyed by slug: moving to another product resets the gallery.
	return <Product key={data.slug} product={data} />
}

function Product({ product }: { product: ProductDetail }) {
	const age = ageLabel(product.ageMin, product.ageMax)
	return (
		<div className="pt-6 pb-20 sm:pt-8">
			<Breadcrumbs className="mb-8 text-sm">
				<Breadcrumbs.Item href="/">All gifts</Breadcrumbs.Item>
				<Breadcrumbs.Item href={`/category/${product.category.slug}`}>
					{product.category.name}
				</Breadcrumbs.Item>
				<Breadcrumbs.Item>{product.name}</Breadcrumbs.Item>
			</Breadcrumbs>

			<div className="grid gap-10 @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @4xl:gap-16">
				<Gallery product={product} />

				<div className="flex flex-col">
					<p className="text-xs font-medium tracking-wide text-muted uppercase">
						{product.category.name}
					</p>
					<h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
						{product.name}
					</h1>
					<div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
						<span className="tabular text-2xl font-semibold">
							{money(product.priceCents)}
						</span>
						<Availability product={product} className="text-sm" />
					</div>

					<div className="mt-8 flex flex-wrap items-center gap-3">
						<AddToCart product={product} size="lg" />
					</div>

					<dl className="mt-10 divide-y divide-separator border-y border-separator text-sm">
						{age && (
							<Fact icon={<AgeIcon />} term="Age">
								{age}
							</Fact>
						)}
						<Fact icon={<TruckIcon />} term="Delivery">
							{deliveryLabel(product.deliveryDays)}
						</Fact>
						{product.requires.length > 0 && (
							<Fact icon={<PlugIcon />} term="Not included">
								<ul className="flex flex-col gap-1">
									{product.requires.map((r) => (
										<li key={r.id}>
											<Link
												to={`/product/${r.slug}`}
												className="underline decoration-separator underline-offset-4 hover:decoration-foreground"
											>
												{r.name}
											</Link>
											<span className="tabular whitespace-nowrap text-muted">
												{' '}
												· {money(r.priceCents)}
											</span>
										</li>
									))}
								</ul>
							</Fact>
						)}
					</dl>

					<p className="mt-8 leading-relaxed text-foreground/85">
						{product.description}
					</p>

					{product.tags.length > 0 && (
						<ul className="mt-8 flex flex-wrap gap-2" aria-label="Tags">
							{product.tags.map((t) => (
								<li key={t.slug}>
									<Chip variant="secondary" size="sm">
										{t.name}
									</Chip>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	)
}

function Fact({
	icon,
	term,
	children,
}: {
	icon: ReactNode
	term: string
	children: ReactNode
}) {
	return (
		<div className="flex items-start gap-4 py-4 leading-5">
			<span className="text-muted [&>svg]:size-5" aria-hidden>
				{icon}
			</span>
			<dt className="w-28 shrink-0 text-muted">{term}</dt>
			<dd className="min-w-0 flex-1">{children}</dd>
		</div>
	)
}

function Gallery({ product }: { product: ProductDetail }) {
	const [index, setIndex] = useState(0)
	const count = product.images.length
	const go = (next: number) => setIndex((next + count) % count)
	const current = product.images[index]
	if (!current) return null

	return (
		<section
			aria-label={`${product.name} photos`}
			aria-roledescription="carousel"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'ArrowLeft') go(index - 1)
				if (e.key === 'ArrowRight') go(index + 1)
			}}
			className="flex flex-col gap-4 outline-none"
		>
			<div className="group relative">
				<ProductImage
					image={current}
					category={product.category.slug}
					position={index}
					className="aspect-square rounded-3xl"
				/>
				{count > 1 && (
					<div className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
						<Button
							isIconOnly
							variant="secondary"
							aria-label="Previous photo"
							className="pointer-events-auto"
							onPress={() => go(index - 1)}
						>
							<IconChevronLeft />
						</Button>
						<Button
							isIconOnly
							variant="secondary"
							aria-label="Next photo"
							className="pointer-events-auto"
							onPress={() => go(index + 1)}
						>
							<IconChevronRight />
						</Button>
					</div>
				)}
				<Chip size="sm" className="tabular absolute right-4 bottom-4">
					{index + 1} / {count}
				</Chip>
			</div>
			<ul className="grid grid-cols-5 gap-3">
				{product.images.map((image, i) => (
					<li key={image.url}>
						<button
							type="button"
							aria-label={`Photo ${i + 1}: ${image.alt}`}
							aria-current={i === index}
							onClick={() => setIndex(i)}
							className={`block w-full overflow-hidden rounded-2xl ring-offset-2 ring-offset-background transition focus-visible:outline-2 focus-visible:outline-focus ${i === index ? 'ring-2 ring-foreground' : 'opacity-70 hover:opacity-100'}`}
						>
							<ProductImage
								image={image}
								category={product.category.slug}
								position={i}
								className="aspect-square"
							/>
						</button>
					</li>
				))}
			</ul>
		</section>
	)
}

function ProductSkeleton() {
	return (
		<div className="grid gap-10 pt-20 pb-20 @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @4xl:gap-16">
			<div className="flex flex-col gap-4">
				<Skeleton className="aspect-square rounded-3xl" />
				<div className="grid grid-cols-5 gap-3">
					{Array.from({ length: 5 }, (_, i) => (
						<Skeleton key={i} className="aspect-square rounded-2xl" />
					))}
				</div>
			</div>
			<div className="flex flex-col gap-4">
				<Skeleton className="h-3 w-24 rounded" />
				<Skeleton className="h-10 w-4/5 rounded" />
				<Skeleton className="h-7 w-28 rounded" />
				<Skeleton className="mt-6 h-12 w-40 rounded-2xl" />
			</div>
		</div>
	)
}
