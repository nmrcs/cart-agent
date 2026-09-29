import type { ProductImage as Image } from '@cart-agent/contracts'
import { type CSSProperties, useState } from 'react'
import { CategoryMark } from './Icons'

// One hue per category, so a grid of placeholders does not read as one wall.
// The tone comes from the theme (see index.css): pale on paper, deep on dark.
// A real photo at the image url covers the placeholder once it loads.
const hues: Record<string, number> = {
	toys: 60,
	'games-puzzles': 150,
	books: 250,
	'arts-crafts': 25,
	science: 200,
	outdoor: 120,
	tech: 280,
	home: 80,
	essentials: 80,
}

// Each shot of the same product sits the mark differently, so thumbnails can
// be told apart before real photos exist.
const framings = [
	'size-[44%]',
	'size-[46%] -rotate-6',
	'size-[58%] translate-x-[12%]',
	'size-[28%] translate-y-[14%]',
	'size-[40%] rotate-6 -translate-x-[10%]',
]

export function ProductImage({
	image,
	category,
	position = 0,
	className = '',
}: {
	image: Image
	category: string
	position?: number
	className?: string
}) {
	const [loaded, setLoaded] = useState(false)
	const [failed, setFailed] = useState(false)
	return (
		<div
			className={`placeholder-tint relative isolate overflow-hidden ${className}`}
			style={{ '--hue': hues[category] ?? 80 } as CSSProperties}
		>
			{!loaded && (
				<div className="placeholder-mark absolute inset-0 flex items-center justify-center">
					<CategoryMark
						category={category}
						className={framings[position % framings.length]}
						strokeWidth={0.9}
					/>
				</div>
			)}
			{!failed && image.url && (
				<img
					src={image.url}
					alt={image.alt}
					loading="lazy"
					onLoad={() => setLoaded(true)}
					onError={() => setFailed(true)}
					className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
				/>
			)}
			{failed && <span className="sr-only">{image.alt}</span>}
		</div>
	)
}
