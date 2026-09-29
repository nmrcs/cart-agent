import {
	Alert,
	Button,
	Card,
	Chip,
	InputGroup,
	ScrollShadow,
	Spinner,
	Surface,
} from '@heroui/react'
import type { Promotion } from '@cart-agent/contracts'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../lib/money'
import { type Message, type Proposal, useAssistant } from '../store/assistant'
import { ArrowUpIcon, CheckIcon, CloseIcon, RestartIcon } from './Icons'
import { ProductImage } from './ProductImage'

// What the harness is doing, in the shopper's words. Most of a turn is the
// model reading the message and choosing, so the wait gets a name.
const STEPS: Record<string, string> = {
	send: 'Sending',
	interpret: 'Reading your message',
	candidates: 'Checking what is in stock',
	select: 'Choosing',
	quote: 'Checking prices',
	compose: 'Writing a reply',
}

const EXAMPLES = [
	'My brother turns 30 next week. He hikes and loves board games. Up to $70.',
	'A birthday gift for my girlfriend, she loves tea and cozy evenings. Up to $60.',
	'My friend turns 35 on Friday. He cooks a lot and reads before bed. Around $50.',
]

// On a phone the chat covers the catalog, so opening a product closes it.
function closeOnNarrow(setOpen: (open: boolean) => void) {
	if (!window.matchMedia('(min-width: 1024px)').matches) setOpen(false)
}

export function AssistantPanel() {
	const messages = useAssistant((s) => s.messages)
	const step = useAssistant((s) => s.step)
	const error = useAssistant((s) => s.error)
	const setOpen = useAssistant((s) => s.setOpen)
	const reset = useAssistant((s) => s.reset)
	const send = useAssistant((s) => s.send)
	const scroller = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = scroller.current
		if (el) el.scrollTop = el.scrollHeight
	}, [messages.length, step, error])

	// Only the newest card can go to the cart: "Add to cart" applies what the
	// assistant holds now, and older cards are history.
	const latestCard = [...messages]
		.reverse()
		.find((m) => m.role === 'assistant' && m.proposal)?.id

	return (
		<section
			aria-label="Gift assistant"
			className="flex h-full flex-col bg-background"
		>
			<div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-separator pr-2 pl-5">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold">Gift assistant</h2>
					<p className="truncate text-xs text-muted">
						Puts together a cart within your budget
					</p>
				</div>
				<div className="flex shrink-0 items-center">
					{messages.length > 0 && (
						<Button
							size="sm"
							variant="ghost"
							isDisabled={step !== null}
							onPress={reset}
						>
							<RestartIcon className="size-4" />
							New chat
						</Button>
					)}
					<Button
						isIconOnly
						size="sm"
						variant="ghost"
						aria-label="Close the assistant"
						onPress={() => setOpen(false)}
					>
						<CloseIcon className="size-4" />
					</Button>
				</div>
			</div>

			<ScrollShadow
				ref={scroller}
				className="flex-1 px-5 py-6"
				aria-live="polite"
			>
				{messages.length === 0 ? (
					<Intro onPick={(text) => void send(text)} />
				) : (
					<ol className="flex flex-col gap-5">
						{messages.map((m) => (
							<li key={m.id}>
								<Bubble message={m} isLatestCard={m.id === latestCard} />
							</li>
						))}
					</ol>
				)}
				{step && <Working step={step} />}
				{error && (
					<Alert status="danger" className="mt-5">
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Description>{error}</Alert.Description>
						</Alert.Content>
					</Alert>
				)}
			</ScrollShadow>

			<Composer />
		</section>
	)
}

function Intro({ onPick }: { onPick: (text: string) => void }) {
	return (
		<div className="flex flex-col gap-5">
			<div>
				<p className="font-display text-xl">Tell me who it is for</p>
				<p className="mt-2 text-sm leading-relaxed text-muted">
					Their age, your budget and when it has to arrive. I will pick from
					what is in stock, keep within the budget and tell you what is left of
					it.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				{EXAMPLES.map((text) => (
					<Button
						key={text}
						variant="outline"
						fullWidth
						className="h-auto justify-start py-2.5 text-left whitespace-normal"
						onPress={() => onPick(text)}
					>
						{text}
					</Button>
				))}
			</div>
		</div>
	)
}

function Bubble({
	message,
	isLatestCard,
}: {
	message: Message
	isLatestCard: boolean
}) {
	if (message.role === 'user')
		return (
			<Surface
				variant="secondary"
				className="ml-auto w-fit max-w-[85%] rounded-3xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap"
			>
				{message.text}
			</Surface>
		)
	if (message.role === 'notice')
		return (
			<Alert status="warning">
				<Alert.Indicator />
				<Alert.Content>
					<Alert.Description>{message.text}</Alert.Description>
				</Alert.Content>
			</Alert>
		)
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm leading-relaxed whitespace-pre-wrap">
				{message.text}
			</p>
			{message.promotion && <PromotionCard promotion={message.promotion} />}
			{message.proposal && (
				<ProposalCard
					messageId={message.id}
					proposal={message.proposal}
					isLatest={isLatestCard}
				/>
			)}
		</div>
	)
}

function ProposalCard({
	messageId,
	proposal,
	isLatest,
}: {
	messageId: string
	proposal: Proposal
	isLatest: boolean
}) {
	const apply = useAssistant((s) => s.apply)
	const applying = useAssistant((s) => s.applying)
	const busy = useAssistant((s) => s.step !== null)
	const setOpen = useAssistant((s) => s.setOpen)
	const { quote, remainderCents, budgetCents, notIncluded, applied } = proposal

	return (
		<Card className={isLatest ? undefined : 'opacity-60'}>
			<Card.Content>
				<ul className="divide-y divide-separator">
					{quote.lines.map((line) => (
						<li key={line.product.slug} className="flex gap-3 py-3 first:pt-0">
							<Link
								to={`/product/${line.product.slug}`}
								onClick={() => closeOnNarrow(setOpen)}
								className="block shrink-0"
							>
								<ProductImage
									image={line.product.image}
									category={line.product.category.slug}
									className="size-12 rounded-xl"
								/>
							</Link>
							<div className="flex min-w-0 flex-1 items-start justify-between gap-3">
								<div className="min-w-0">
									<Link
										to={`/product/${line.product.slug}`}
										onClick={() => closeOnNarrow(setOpen)}
										className="line-clamp-2 text-sm leading-snug font-medium hover:underline hover:underline-offset-4"
									>
										{line.product.name}
									</Link>
									<p className="tabular mt-0.5 text-xs text-muted">
										{line.quantity} × {money(line.product.priceCents)}
									</p>
								</div>
								<span className="tabular shrink-0 text-sm font-semibold">
									{money(line.lineTotalCents)}
								</span>
							</div>
						</li>
					))}
				</ul>
				<dl className="flex flex-col gap-1 border-t border-separator pt-3 text-sm">
					{quote.discount && (
						<>
							<div className="flex items-baseline justify-between">
								<dt className="text-muted">Subtotal</dt>
								<dd className="tabular">{money(quote.subtotalCents)}</dd>
							</div>
							<div className="flex items-baseline justify-between">
								<dt className="text-muted">
									{quote.discount.label}, {quote.discount.percent}%
								</dt>
								<dd className="tabular font-medium text-success">
									−{money(quote.discount.amountCents)}
								</dd>
							</div>
						</>
					)}
					<div className="flex items-baseline justify-between">
						<dt className="text-muted">Total</dt>
						<dd className="tabular font-semibold">{money(quote.totalCents)}</dd>
					</div>
					{budgetCents !== null && remainderCents !== null && (
						<div className="flex items-baseline justify-between">
							<dt className="text-muted">
								{remainderCents >= 0
									? `Left of ${money(budgetCents)}`
									: `Over ${money(budgetCents)} by`}
							</dt>
							<dd
								className={`tabular font-medium ${remainderCents >= 0 ? 'text-(--cobalt)' : 'text-danger'}`}
							>
								{money(Math.abs(remainderCents))}
							</dd>
						</div>
					)}
				</dl>
				{notIncluded.length > 0 && (
					<Card.Description className="text-xs">
						Needs{' '}
						{notIncluded
							.map((p) => `${p.name} (${money(p.priceCents)})`)
							.join(', ')}
						. Not included and not added.
					</Card.Description>
				)}
			</Card.Content>
			{isLatest && (
				<Card.Footer>
					{applied ? (
						<Button fullWidth variant="tertiary" isDisabled>
							<CheckIcon className="size-4" />
							In your cart
						</Button>
					) : (
						<Button
							fullWidth
							isPending={applying === messageId}
							isDisabled={busy}
							onPress={() => void apply(messageId)}
						>
							Add to cart
						</Button>
					)}
				</Card.Footer>
			)}
		</Card>
	)
}

// The shop's discount, drawn from the backend's rule rather than from the
// model's words: when it applies, why, and what the budget now covers.
function PromotionCard({ promotion }: { promotion: Promotion }) {
	const day = new Date(`${promotion.birthdayOn}T00:00:00Z`).toLocaleDateString(
		'en-US',
		{ weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' },
	)
	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<Card.Title className="text-sm">{promotion.label}</Card.Title>
				<Chip color="success" variant="soft" size="sm">
					{promotion.percent}% off
				</Chip>
			</Card.Header>
			<Card.Content className="gap-1.5 text-sm">
				<p>
					The birthday is on {day}, within {promotion.withinWorkingDays} working
					days, so the whole order is {promotion.percent}% off.
				</p>
				{promotion.budgetCents !== null && promotion.coversCents !== null && (
					<p className="text-muted">
						Your {money(promotion.budgetCents)} budget now covers up to{' '}
						<span className="tabular font-semibold text-foreground">
							{money(promotion.coversCents)}
						</span>{' '}
						in gifts.
					</p>
				)}
			</Card.Content>
		</Card>
	)
}

function Working({ step }: { step: string }) {
	const startedAt = useAssistant((s) => s.startedAt)
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [])
	const seconds = startedAt
		? Math.max(0, Math.floor((now - startedAt) / 1000))
		: 0
	return (
		<div className="mt-5 flex items-center gap-2.5 text-sm text-muted">
			<Spinner size="sm" color="current" />
			<span>{STEPS[step] ?? 'Working'}</span>
			<span className="tabular ml-auto text-xs">{seconds} s</span>
		</div>
	)
}

function Composer() {
	const send = useAssistant((s) => s.send)
	const busy = useAssistant((s) => s.step !== null)
	const [text, setText] = useState('')
	const canSend = text.trim().length > 0 && !busy

	return (
		<form
			className="shrink-0 border-t border-separator p-3"
			onSubmit={(e) => {
				e.preventDefault()
				if (!canSend) return
				void send(text)
				setText('')
			}}
		>
			{/* A pill tall enough for the send button to sit inside it. */}
			<InputGroup fullWidth className="h-12 rounded-full">
				<InputGroup.Input
					aria-label="Message the assistant"
					placeholder="Who is the gift for?"
					maxLength={1000}
					value={text}
					onChange={(e) => setText(e.target.value)}
					className="pl-5"
				/>
				<InputGroup.Suffix className="border-0 pr-1.5">
					<Button
						type="submit"
						isIconOnly
						aria-label="Send"
						isDisabled={!canSend}
						className="size-9 rounded-full"
					>
						<ArrowUpIcon className="size-4" />
					</Button>
				</InputGroup.Suffix>
			</InputGroup>
			<p className="mt-2 text-center text-xs text-muted">
				AI can make mistakes. Check important info.
			</p>
		</form>
	)
}
