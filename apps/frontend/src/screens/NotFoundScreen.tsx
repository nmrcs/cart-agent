import { EmptyState } from '@heroui/react'
import { Link } from 'react-router-dom'

export function NotFoundScreen() {
	return (
		<EmptyState className="flex flex-col items-center gap-4 py-32 text-center">
			<p className="font-display text-3xl">Page not found</p>
			<Link to="/" className="button button--primary button--md">
				Back to the catalog
			</Link>
		</EmptyState>
	)
}
