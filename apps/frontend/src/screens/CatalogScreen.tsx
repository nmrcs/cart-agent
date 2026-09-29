import type { Category } from '@cart-agent/contracts'
import { Button, EmptyState, Skeleton } from '@heroui/react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CategoryNav } from '../components/CategoryNav'
import { PaginationBar } from '../components/PaginationBar'
import { ProductCard } from '../components/ProductCard'
import { api } from '../lib/api'
import { useResource } from '../lib/use-resource'
import { scrollStoreToTop } from '../lib/scroll'

const PAGE_SIZE = 12

export function CatalogScreen({ categories }: { categories: Category[] }) {
	const { slug } = useParams()
	const [params, setParams] = useSearchParams()
	const page = Math.max(1, Number(params.get('page')) || 1)
	const category = categories.find((c) => c.slug === slug)

	const { data, error, loading, retry } = useResource(
		`${slug ?? ''}:${page}`,
		() => api.products({ category: slug, page, pageSize: PAGE_SIZE }),
	)
	const pageCount = data ? Math.ceil(data.total / data.pageSize) : 0

	function goTo(next: number) {
		setParams(next === 1 ? {} : { page: String(next) })
		scrollStoreToTop('smooth')
	}

	return (
		<div className="flex flex-col gap-10">
			<section className="pt-10 sm:pt-14">
				<h1 className="font-display text-4xl sm:text-6xl">
					{category ? category.name : 'Gifts for everyone'}
				</h1>
				<p className="mt-3 max-w-xl text-muted">
					{category
						? `${category.productCount} items`
						: 'Toys, books, games and small comforts, with real stock counts and delivery dates on every item.'}
				</p>
			</section>

			<CategoryNav categories={categories} />

			{error ? (
				<EmptyState className="flex flex-col items-center gap-4 py-24 text-center">
					<p className="font-display text-xl">The catalog did not load</p>
					<p className="text-sm text-muted">{error.message}</p>
					<Button variant="secondary" onPress={retry}>
						Try again
					</Button>
				</EmptyState>
			) : (
				<ul
					className={`grid grid-cols-2 gap-x-5 gap-y-12 @xl:grid-cols-3 @4xl:grid-cols-4 @4xl:gap-x-8 ${loading && data ? 'opacity-60 transition-opacity' : ''}`}
				>
					{data
						? data.items.map((p) => (
								<li key={p.id}>
									<ProductCard product={p} />
								</li>
							))
						: Array.from({ length: 8 }, (_, i) => (
								<li key={i} className="flex flex-col gap-3">
									<Skeleton className="aspect-square rounded-2xl" />
									<Skeleton className="h-3 w-1/3 rounded" />
									<Skeleton className="h-4 w-4/5 rounded" />
									<Skeleton className="h-4 w-1/4 rounded" />
								</li>
							))}
				</ul>
			)}

			{data && (
				<div className="pb-16">
					<PaginationBar page={page} pageCount={pageCount} onChange={goTo} />
				</div>
			)}
		</div>
	)
}
