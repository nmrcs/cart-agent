import { Badge, Button } from '@heroui/react'
import { Link } from 'react-router-dom'
import { useAssistant } from '../store/assistant'
import { useCart } from '../store/cart'
import { BagIcon, ChatIcon } from './Icons'

export function Header() {
	const count = useCart((s) => s.cart?.itemCount ?? 0)
	const setOpen = useCart((s) => s.setOpen)
	const chatOpen = useAssistant((s) => s.isOpen)
	const setChatOpen = useAssistant((s) => s.setOpen)
	// 64px with the border, the same as the chat's top bar beside it.
	return (
		<header className="h-16 shrink-0 border-b border-separator bg-background">
			<div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
				<Link to="/" className="text-lg font-bold tracking-[0.18em] uppercase">
					Store
				</Link>
				<div className="flex items-center gap-1">
					<Button
						variant={chatOpen ? 'secondary' : 'ghost'}
						aria-expanded={chatOpen}
						aria-label="Gift assistant"
						onPress={() => setChatOpen(!chatOpen)}
					>
						<ChatIcon className="size-5" />
						<span className="hidden sm:inline">Assistant</span>
					</Button>
					<Badge.Anchor>
						<Button
							variant="ghost"
							aria-label={count ? `Cart, ${count} items` : 'Cart'}
							onPress={() => setOpen(true)}
						>
							<BagIcon className="size-5" />
							<span className="hidden sm:inline">Cart</span>
						</Button>
						{count > 0 && (
							<Badge color="accent" size="sm">
								{count}
							</Badge>
						)}
					</Badge.Anchor>
				</div>
			</div>
		</header>
	)
}
