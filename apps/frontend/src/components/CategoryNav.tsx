import type { Category } from '@cart-agent/contracts'
import { Tabs } from '@heroui/react'
import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'

const ALL = 'all'
// Tabs as wide as their label: the library's equal widths broke
// "Games & Puzzles" onto two lines.
const tabClass = 'h-11 w-auto flex-none px-5 text-[15px] whitespace-nowrap'

// Tabs as links: the route is the state, so the selected tab follows the URL
// and the back button works. Navigation goes through the RouterProvider in App.
export function CategoryNav({ categories }: { categories: Category[] }) {
	const { slug } = useParams()
	const selected = slug ?? ALL
	const wrap = useRef<HTMLDivElement>(null)

	// On a phone, scroll the selected tab to the middle of the row. The tabs
	// appear a frame after this effect, so wait for them.
	useEffect(() => {
		let frame = 0
		let tries = 0
		const center = () => {
			const tab = wrap.current?.querySelector<HTMLElement>(
				'[role="tab"][aria-selected="true"]',
			)
			const scroller = tab?.closest<HTMLElement>('.scroll-shadow')
			if (!tab || !scroller) {
				if (++tries < 20) frame = requestAnimationFrame(center)
				return
			}
			const t = tab.getBoundingClientRect()
			const s = scroller.getBoundingClientRect()
			scroller.scrollLeft += t.left - s.left - (s.width - t.width) / 2
		}
		frame = requestAnimationFrame(center)
		return () => cancelAnimationFrame(frame)
	}, [selected, categories.length])

	return (
		<div ref={wrap}>
			<Tabs variant="secondary" selectedKey={selected} className="w-full">
				<Tabs.ListContainer>
					<Tabs.List aria-label="Categories">
						<Tabs.Tab id={ALL} href="/" className={tabClass}>
							All gifts
							<Tabs.Indicator />
						</Tabs.Tab>
						{categories.map((c) => (
							<Tabs.Tab
								key={c.slug}
								id={c.slug}
								href={`/category/${c.slug}`}
								className={tabClass}
							>
								{c.name}
								<Tabs.Indicator />
							</Tabs.Tab>
						))}
					</Tabs.List>
				</Tabs.ListContainer>
			</Tabs>
		</div>
	)
}
