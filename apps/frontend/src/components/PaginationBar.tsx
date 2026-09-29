import { Pagination } from '@heroui/react'

export function PaginationBar({
	page,
	pageCount,
	onChange,
}: {
	page: number
	pageCount: number
	onChange: (page: number) => void
}) {
	if (pageCount <= 1) return null
	return (
		<Pagination className="justify-center">
			<Pagination.Content>
				<Pagination.Item>
					<Pagination.Previous
						onClick={() => page > 1 && onChange(page - 1)}
						aria-disabled={page === 1}
					>
						<Pagination.PreviousIcon />
					</Pagination.Previous>
				</Pagination.Item>
				{pageWindow(page, pageCount).map((it, i) =>
					it === '…' ? (
						<Pagination.Item key={`gap-${i}`}>
							<Pagination.Ellipsis />
						</Pagination.Item>
					) : (
						<Pagination.Item key={it}>
							<Pagination.Link
								isActive={it === page}
								onClick={() => onChange(it)}
							>
								{it}
							</Pagination.Link>
						</Pagination.Item>
					),
				)}
				<Pagination.Item>
					<Pagination.Next
						onClick={() => page < pageCount && onChange(page + 1)}
						aria-disabled={page === pageCount}
					>
						<Pagination.NextIcon />
					</Pagination.Next>
				</Pagination.Item>
			</Pagination.Content>
		</Pagination>
	)
}

function pageWindow(current: number, total: number): (number | '…')[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
	const items: (number | '…')[] = [1]
	const start = Math.max(2, current - 1)
	const end = Math.min(total - 1, current + 1)
	if (start > 2) items.push('…')
	for (let i = start; i <= end; i++) items.push(i)
	if (end < total - 1) items.push('…')
	items.push(total)
	return items
}
