import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			width="1em"
			height="1em"
			{...props}
		>
			{children}
		</svg>
	)
}

export const BagIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M5 8h14l-1 12H6L5 8Z" />
		<path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
	</Icon>
)

export const TrashIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7" />
	</Icon>
)

export const TruckIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M3 6.5h10.5v9H3zM13.5 10H18l3 3v2.5h-7.5" />
		<circle cx="7" cy="17.5" r="1.75" />
		<circle cx="17" cy="17.5" r="1.75" />
	</Icon>
)

export const AgeIcon = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="12" cy="8" r="3.5" />
		<path d="M5 20c.8-3.7 3.6-6 7-6s6.2 2.3 7 6" />
	</Icon>
)

export const PlugIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="7" y="4" width="10" height="16" rx="1.5" />
		<path d="M10 2.5h4M10 12h4" />
	</Icon>
)

export const ChatIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4 3.5v-3.5h-.5a2 2 0 0 1-2-2z" />
		<path d="M8.5 9.5h7M8.5 12.5h4.5" />
	</Icon>
)

export const ArrowUpIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M12 19V5M6 11l6-6 6 6" />
	</Icon>
)

export const CloseIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M6 6l12 12M18 6 6 18" />
	</Icon>
)

export const RestartIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
		<path d="M4.5 4.5V9H9" />
	</Icon>
)

export const CheckIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m5 12.5 4.5 4.5L19 7.5" />
	</Icon>
)

// Category marks for image placeholders: one quiet line drawing per category.
const categoryPaths: Record<string, ReactNode> = {
	toys: (
		<>
			<rect x="4" y="12" width="7" height="7" rx="1" />
			<rect x="13" y="12" width="7" height="7" rx="1" />
			<rect x="8.5" y="5" width="7" height="7" rx="1" />
		</>
	),
	'games-puzzles': (
		<>
			<rect x="4.5" y="4.5" width="15" height="15" rx="3" />
			<circle cx="9" cy="9" r="0.9" fill="currentColor" />
			<circle cx="15" cy="15" r="0.9" fill="currentColor" />
			<circle cx="12" cy="12" r="0.9" fill="currentColor" />
		</>
	),
	books: (
		<>
			<path d="M4 5.5c3-1 5.5-1 8 .8 2.5-1.8 5-1.8 8-.8v13c-3-1-5.5-1-8 .8-2.5-1.8-5-1.8-8-.8z" />
			<path d="M12 6.3v13" />
		</>
	),
	'arts-crafts': (
		<>
			<path d="M14.5 4.5 19.5 9.5 11 18l-5 1 1-5 7.5-9.5Z" />
			<path d="M12.5 6.5 17.5 11.5" />
		</>
	),
	science: (
		<>
			<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 19l-5.5-9.5v-6" />
			<path d="M7.5 15h9" />
		</>
	),
	outdoor: (
		<>
			<path d="M3 19 9.5 9l4 6 2.5-3.5L21 19z" />
			<circle cx="17" cy="6.5" r="2" />
		</>
	),
	tech: (
		<>
			<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" />
			<rect x="3.5" y="14" width="4" height="6" rx="1.5" />
			<rect x="16.5" y="14" width="4" height="6" rx="1.5" />
		</>
	),
	home: (
		<>
			<path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
			<path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11.5 3.5v2" />
		</>
	),
	essentials: (
		<>
			<rect x="8" y="5" width="8" height="15" rx="1.5" />
			<path d="M10.5 3.5h3M10 11h4M12 9v4" />
		</>
	),
}

export function CategoryMark({
	category,
	...p
}: IconProps & { category: string }) {
	return <Icon {...p}>{categoryPaths[category] ?? categoryPaths.toys}</Icon>
}
