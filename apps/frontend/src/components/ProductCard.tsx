import type { ProductSummary } from '@cart-agent/contracts'
import { Link } from 'react-router-dom'
import { money } from '../lib/money'
import { AddToCart } from './AddToCart'
import { Availability } from './Availability'
import { ProductImage } from './ProductImage'

export function ProductCard({ product }: { product: ProductSummary }) {
	const href = `/product/${product.slug}`
	return (
		<article className="group flex h-full flex-col">
			<Link
				to={href}
				className="block overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
			>
				<ProductImage
					image={product.image}
					category={product.category.slug}
					className={`aspect-square transition-transform duration-500 ease-out group-hover:scale-[1.03] ${product.stock === 0 ? 'opacity-60' : ''}`}
				/>
			</Link>
			<div className="mt-4 flex flex-1 flex-col">
				<p className="text-xs font-medium tracking-wide text-muted uppercase">
					{product.category.name}
				</p>
				<Link
					to={href}
					className="mt-1 line-clamp-2 leading-snug font-medium text-foreground hover:underline hover:underline-offset-4"
				>
					{product.name}
				</Link>
				<span className="tabular mt-2 text-[15px] font-semibold">
					{money(product.priceCents)}
				</span>
				<Availability product={product} short className="mt-1 text-xs" />
				<div className="mt-auto pt-4">
					<AddToCart product={product} size="sm" />
				</div>
			</div>
		</article>
	)
}
