import {
	BIRTHDAY_DISCOUNT,
	beforeDiscount,
	birthdayQualifies,
	type Candidate,
	type ProductSummary,
	type Promotion,
	type TraceStep,
	type TurnRequest,
	type TurnResponse,
} from '@cart-agent/contracts'
import { Injectable } from '@nestjs/common'
import { BackendClient } from '../backend/backend.client'
import { LlmService } from '../llm/llm.service'
import { nextQuestion } from '../profile/gift.profile'
import { type ComposeMode, composePrompt } from './composer'
import { type Conversation, ConversationStore } from './conversation.store'
import { localToday, resolveWhen, weekdayName, workingDaysUntil } from './dates'
import {
	type Interpretation,
	interpretationPrompt,
	interpretationSchema,
} from './interpreter'
import { inventedAmounts, offStyle, usd } from './money-guard'
import { applyChanges, fillWithinBudget } from './proposal'
import { type Pick, selectionPrompt, selectionSchema } from './selector'

type Facts = Record<string, unknown>

// A dot inside a price ("for $29.00 to your cart") does not end the sentence.
const CART_CHANGE =
	/\b(?:added|removed|put|placed|taken|dropped|updated|changed)\b(?:[^.]|\.\d)*\b(?:to|from|in|into|out of|of)\s+(?:your|the)\s+cart\b/i
// "Yes, pick a second one, something for hiking" once swapped the proposed
// game for an alternative: "second one" read as "the second option".
const ADD_WORDS =
	/\b(?:second|another|one more|also|as well|too|in addition)\b/i
const INSTEAD_WORDS = /\b(?:instead|swap|replace|rather|switch)\b/i
const PUT_IN_CART =
	/\b(?:put|add|place)\s+(?:it|them|both|all|these|this|everything)(?:\s+both)?\s+(?:in|into|to)\s+(?:my|the)\s+cart\b/i
// An offer to add more, which only the second-gift question may make: after
// adding a gift the model once asked "Would you like to add a third item for
// the remaining amount?".
const OFFER_MORE =
	/\b(?:add|include|pick|choose|get)\b[^.?]*\b(?:anything|something|more|another|extra|second|third|remaining|rest)\b[^.]*\?|\banything else\b[^.]*\?/i
const NUMBER_WORDS = /\b(?:two|three|2|3|a couple|a few)\b/i
const PRICE_WORDS =
	/\b(discount|coupon|promo|voucher|code)\b|%\s*off|\bcheaper\b/i
type Timed = <T>(
	step: string,
	fn: () => Promise<T>,
	detail?: (value: T) => string,
) => Promise<T>

// One turn of the conversation. The model is called for three narrow jobs —
// read the message, rank a shortlist, word the reply — and code does
// everything that can be wrong in money: filtering, fitting the budget,
// pricing through the backend, and checking every amount in the reply.
@Injectable()
export class TurnsService {
	constructor(
		private readonly llm: LlmService,
		private readonly backend: BackendClient,
		private readonly store: ConversationStore,
	) {}

	// onStep fires as each step starts, for the streaming endpoint.
	async turn(
		req: TurnRequest,
		onStep?: (step: string) => void,
	): Promise<TurnResponse> {
		const { value, usage } = await this.llm.metered(() => this.run(req, onStep))
		return { ...value, usage }
	}

	private async run(
		req: TurnRequest,
		onStep?: (step: string) => void,
	): Promise<Omit<TurnResponse, 'usage'>> {
		const trace: TraceStep[] = []
		const timed: Timed = async (step, fn, detail) => {
			onStep?.(step)
			const start = performance.now()
			const value = await fn()
			trace.push({
				step,
				ms: Math.round(performance.now() - start),
				...(detail ? { detail: detail(value) } : {}),
			})
			return value
		}

		const c = this.store.get(req.conversationId)
		const today = req.today ?? localToday()
		c.today = today
		const lastAssistant =
			[...c.history].reverse().find((m) => m.role === 'assistant')?.content ??
			null
		const fresh = c.history.length === 0
		c.history.push({ role: 'user', content: req.message })

		const referable = [
			...new Set([
				...c.lines.map((l) => l.slug),
				...c.alternatives.map((a) => a.slug),
			]),
		]
		const read = await timed(
			'interpret',
			() =>
				this.llm.json<Interpretation>(
					'interpretation',
					interpretationSchema(referable),
					interpretationPrompt({
						today,
						weekday: weekdayName(today),
						lastAssistant,
						proposal: c.lines.map((l) => ({
							slug: l.slug,
							name: c.known.get(l.slug)?.name ?? l.slug,
							quantity: l.quantity,
						})),
						alternatives: c.alternatives.map((a) => ({
							slug: a.slug,
							name: a.name,
						})),
						message: req.message,
					}),
				),
			(r) =>
				[
					r.intent,
					r.neededByWeekday ??
						r.neededByDate ??
						(r.neededByInDays !== null ? `${r.neededByInDays} days` : null),
					r.anyGiftOk ? 'any gift ok' : null,
				]
					.filter(Boolean)
					.join(', '),
		)

		// Asking for a lower price is never an edit of the cart, whatever the
		// model read into it: "apply coupon SAVE80" once swapped the game.
		if (PRICE_WORDS.test(req.message)) read.intent = 'price'
		else if (
			c.lines.length &&
			PUT_IN_CART.test(req.message) &&
			!INSTEAD_WORDS.test(req.message)
		)
			read.intent = 'accept'
		else if (
			read.intent === 'change' &&
			ADD_WORDS.test(req.message) &&
			!INSTEAD_WORDS.test(req.message)
		) {
			read.intent = 'more'
			read.moreHint = read.moreHint ?? req.message
		}
		// With nothing proposed there is nothing to accept, change or price:
		// "$80 for both" once read as a price request, the budget was never
		// taken and the shopper was told three times that prices are fixed.
		else if (!c.lines.length) read.intent = 'info'

		const before = constraints(c)
		merge(c, read, today, req.message)
		c.lastAsked = null
		const constraintsChanged = before !== constraints(c)
		const promo = promotion(c)

		const money = new Set<number>()
		const $ = (cents: number) => {
			money.add(cents)
			return usd(cents)
		}

		let mode: ComposeMode
		let facts: Facts = {}
		let applyProposal = false
		let cartSet: TurnResponse['cartSet'] = []

		if (read.intent === 'accept' && c.quote?.lines.length) {
			mode = 'applied'
			applyProposal = true
			c.inCart = c.lines.map((l) => ({ ...l }))
			facts = {
				items: c.quote.lines.map((l) => l.product.name),
				notIncluded: notIncluded(c).map((n) => n.name),
			}
		} else if (read.intent === 'price') {
			// Prices are the catalog's; there is no code path that changes them.
			mode = 'price'
			facts = {
				...(c.lines.length ? this.cartFacts(c, $) : {}),
				onlyDiscount: `${BIRTHDAY_DISCOUNT.percent}% off the whole order when the gift is for a birthday within ${BIRTHDAY_DISCOUNT.withinWorkingDays} working days`,
				...(promo ? { birthdayDiscountApplies: true } : {}),
			}
		} else if (read.intent === 'change' && c.lines.length) {
			const changes = read.changes
				.filter((ch) => ch.item !== 'none')
				.map((ch) => ({
					slug: ch.item,
					quantity: Math.max(0, Math.min(99, ch.quantity)),
				}))
			for (const ch of changes) {
				const had = c.lines.some((l) => l.slug === ch.slug)
				if (ch.quantity === 0 && had) c.declined.add(ch.slug)
				if (ch.quantity > 0) c.declined.delete(ch.slug)
			}
			c.lines = applyChanges(c.lines, changes)
			const problems = await timed('quote', () => this.requote(c))
			cartSet = syncCart(c)
			mode = 'updated'
			facts = {
				...this.cartFacts(c, $),
				problems,
				...(cartSet.length ? { inCart: true } : {}),
			}
		} else if (read.intent === 'more' && c.lines.length) {
			;({ mode, facts } = await this.more(c, read, today, $, timed, promo))
		} else {
			const question = nextQuestion(c.profile)
			if (question) {
				mode = 'ask'
				c.lastAsked = question.key
				facts = {
					question:
						c.profile.isBirthday && question.askIfBirthday
							? question.askIfBirthday
							: question.ask,
					known: known(c, $),
				}
			} else if (!c.lines.length || constraintsChanged) {
				;({ mode, facts } = await this.propose(c, read, today, $, timed, promo))
			} else {
				mode = 'other'
				facts = this.cartFacts(c, $)
			}
		}

		const reply = await timed(
			'compose',
			() => this.compose(mode, facts, c, [...money]),
			(r) => (r.guarded ? `${mode}, fallback: ${r.guarded}` : mode),
		)
		c.history.push({ role: 'assistant', content: reply.text })

		const total = c.quote?.totalCents ?? null
		return {
			conversationId: c.id,
			fresh,
			reply: reply.text,
			profile: c.profile,
			proposal: c.quote,
			remainderCents:
				c.profile.budgetCents !== null && total !== null
					? c.profile.budgetCents - total
					: null,
			notIncluded: notIncluded(c),
			applyProposal,
			promotion: promo,
			cartSet,
			trace,
		}
	}

	private async propose(
		c: Conversation,
		read: Interpretation,
		today: string,
		$: (cents: number) => string,
		timed: Timed,
		promo: Promotion | null,
	): Promise<{ mode: ComposeMode; facts: Facts }> {
		const p = c.profile
		const budget = p.budgetCents as number
		// With the birthday discount the budget buys more before the discount;
		// the backend's quote then checks the discounted total against it.
		const cap = promo?.coversCents ?? budget
		const maxDeliveryDays = workingDaysUntil(today, p.neededBy as string)
		const base = { ageYears: p.ageYears ?? undefined, maxDeliveryDays }
		const shortlist = await timed(
			'candidates',
			() =>
				this.backend.candidates({
					...base,
					maxPriceCents: cap,
					exclude: [...c.declined],
				}),
			(list) => `${list.length} fit`,
		)
		if (!shortlist.length) {
			c.lines = []
			c.quote = null
			c.alternatives = []
			return {
				mode: 'none-fit',
				facts: {
					reason: await this.whyNothingFits(c, today, $),
					budget: $(budget),
				},
			}
		}

		const concrete = p.interests.filter((i) => i !== 'anything')
		const picks = await timed(
			'select',
			() =>
				this.select(
					c,
					shortlist,
					concrete.length
						? `something for someone into ${concrete.join(', ')}`
						: null,
				),
			(list) => list.map((pk) => pk.slug).join(', '),
		)
		const count = Math.max(1, Math.min(3, read.itemsWanted ?? 1))
		c.lines = fillWithinBudget(
			picks.map((pk) => ({
				slug: pk.slug,
				priceCents: c.known.get(pk.slug)!.priceCents,
			})),
			cap,
			count,
		)
		const chosen = new Set(c.lines.map((l) => l.slug))
		c.alternatives = picks
			.filter((pk) => !chosen.has(pk.slug))
			.slice(0, 2)
			.map((pk) => c.known.get(pk.slug)!)
		const problems = await timed('quote', () => this.requote(c))

		// A second gift is offered as a question, never added: only when the
		// discount makes room for one and the shop has one that fits.
		let secondGiftUpTo: number | null = null
		const left = budget - (c.quote?.totalCents ?? budget)
		if (promo && c.lines.length === 1 && left > 0) {
			const upTo = beforeDiscount(left, promo.percent)
			const fits = await this.backend.candidates({
				...base,
				maxPriceCents: upTo,
				exclude: [...c.lines.map((l) => l.slug), ...c.declined],
			})
			if (fits.length) secondGiftUpTo = upTo
		}

		return {
			mode: 'propose',
			facts: {
				...(secondGiftUpTo !== null
					? { secondGiftUpTo: $(secondGiftUpTo) }
					: {}),
				gift: c.lines.map((l) => c.known.get(l.slug)!.name),
				reasons: c.lines.map((l) => c.reasons.get(l.slug) ?? ''),
				...this.cartFacts(c, $),
				// Offered next to a second gift, "the second one" was read as the
				// second alternative.
				alternatives:
					secondGiftUpTo !== null
						? []
						: c.alternatives.map((a) => ({
								name: a.name,
								price: $(a.priceCents),
							})),
				notIncluded: notIncluded(c).map((n) => ({
					name: n.name,
					price: $(n.priceCents),
				})),
				problems,
			},
		}
	}

	// Only on the shopper's request, and only within what is left.
	private async more(
		c: Conversation,
		read: Interpretation,
		today: string,
		$: (cents: number) => string,
		timed: Timed,
		promo: Promotion | null,
	): Promise<{ mode: ComposeMode; facts: Facts }> {
		const p = c.profile
		const remainder = (p.budgetCents ?? 0) - (c.quote?.totalCents ?? 0)
		// Under the discount an item costs the budget less than its price.
		const cap = promo ? beforeDiscount(remainder, promo.percent) : remainder
		const shortlist =
			remainder > 0
				? await timed('candidates', () =>
						this.backend.candidates({
							ageYears: p.ageYears ?? undefined,
							maxPriceCents: cap,
							maxDeliveryDays: p.neededBy
								? workingDaysUntil(today, p.neededBy)
								: undefined,
							exclude: [...c.lines.map((l) => l.slug), ...c.declined],
						}),
					)
				: []
		if (!shortlist.length) {
			return {
				mode: 'no-more',
				facts: { remainder: $(Math.max(0, remainder)) },
			}
		}
		const picks = await timed(
			'select',
			() => this.select(c, shortlist, read.moreHint, false),
			(list) => list.map((pk) => pk.slug).join(', ') || 'nothing matches',
		)
		if (!picks.length) {
			return {
				mode: 'no-more',
				facts: {
					remainder: $(Math.max(0, remainder)),
					asked: read.moreHint,
				},
			}
		}
		const added = fillWithinBudget(
			picks.map((pk) => ({
				slug: pk.slug,
				priceCents: c.known.get(pk.slug)!.priceCents,
			})),
			cap,
			// One add-on unless a number is said: "a second gift for hiking" once
			// came back as a kite and a flying disc.
			NUMBER_WORDS.test(c.history.at(-1)?.content ?? '')
				? Math.max(1, Math.min(3, read.itemsWanted ?? 1))
				: 1,
		)
		c.lines = [...c.lines, ...added]
		const problems = await timed('quote', () => this.requote(c))
		return {
			mode: 'more',
			facts: {
				added: added.map((l) => ({
					name: c.known.get(l.slug)!.name,
					reason: c.reasons.get(l.slug) ?? '',
				})),
				...this.cartFacts(c, $),
				problems,
			},
		}
	}

	private async select(
		c: Conversation,
		shortlist: Candidate[],
		hint: string | null,
		fallbackToShortlist = true,
	): Promise<Pick[]> {
		for (const cand of shortlist) c.known.set(cand.slug, cand)
		const { picks } = await this.llm.json<{ picks: Pick[] }>(
			'selection',
			selectionSchema(shortlist.map((s) => s.slug)),
			selectionPrompt(c.profile, shortlist, hint),
		)
		const seen = new Set<string>()
		const ranked = picks.filter(
			(pk) => c.known.has(pk.slug) && !seen.has(pk.slug) && seen.add(pk.slug),
		)
		for (const pk of ranked) c.reasons.set(pk.slug, pk.reason)
		const fitting = hint ? ranked.filter((pk) => pk.fitsRequest) : ranked
		// For an add-on request, nothing fitting means nothing to add. For a
		// first proposal the shopper still gets options: the model's ranking,
		// or failing that the shortlist.
		if (fitting.length || !fallbackToShortlist) return fitting
		if (ranked.length) return ranked
		return shortlist
			.slice(0, 3)
			.map((s) => ({ slug: s.slug, reason: '', fitsRequest: true }))
	}

	// Prices come from the backend only. A line short on stock is cut to what
	// is available, or dropped, and the shopper is told.
	private async requote(c: Conversation): Promise<string[]> {
		const notes: string[] = []
		if (!c.lines.length) {
			c.quote = null
			return notes
		}
		const opts = { birthdayOn: c.profile.birthdayOn, today: c.today }
		let quote = await this.backend.quote(c.lines, opts)
		if (quote.problems.length) {
			for (const pr of quote.problems) {
				const name = c.known.get(pr.slug)?.name ?? pr.slug
				notes.push(
					pr.available > 0
						? `Only ${pr.available} of ${name} in stock, so the quantity is ${pr.available}.`
						: `${name} is no longer available.`,
				)
			}
			c.lines = c.lines
				.map((l) => {
					const pr = quote.problems.find((x) => x.slug === l.slug)
					return pr ? { ...l, quantity: pr.available } : l
				})
				.filter((l) => l.quantity > 0)
			quote = await this.backend.quote(c.lines, opts)
		}
		c.quote = quote
		return notes
	}

	private cartFacts(c: Conversation, $: (cents: number) => string): Facts {
		const budget = c.profile.budgetCents
		const total = c.quote?.totalCents ?? 0
		return {
			items: (c.quote?.lines ?? []).map((l) => ({
				name: l.product.name,
				quantity: l.quantity,
				price: $(l.product.priceCents),
				lineTotal: $(l.lineTotalCents),
			})),
			...(c.quote?.discount
				? {
						subtotal: $(c.quote.subtotalCents),
						discount: {
							label: c.quote.discount.label,
							percent: c.quote.discount.percent,
							amount: $(c.quote.discount.amountCents),
						},
					}
				: {}),
			total: $(total),
			...(budget !== null
				? budget >= total
					? { budget: $(budget), remainder: $(budget - total) }
					: { budget: $(budget), overBudgetBy: $(total - budget) }
				: {}),
		}
	}

	// When the shortlist is empty, relax one rule at a time to name the one
	// that shut everything out.
	private async whyNothingFits(
		c: Conversation,
		today: string,
		$: (cents: number) => string,
	): Promise<string> {
		const p = c.profile
		const days = workingDaysUntil(today, p.neededBy as string)
		const age = p.ageYears ?? undefined
		if (c.declined.size) {
			const all = await this.backend.candidates({
				ageYears: age,
				maxDeliveryDays: days,
				maxPriceCents: p.budgetCents ?? undefined,
			})
			if (all.length)
				return 'the shopper already turned down everything else that fits the budget, the date and the age'
		}
		const noBudget = await this.backend.candidates({
			ageYears: age,
			maxDeliveryDays: days,
		})
		if (noBudget.length) {
			const cheapest = Math.min(...noBudget.map((x) => x.priceCents))
			return `the budget: the cheapest gift that fits costs ${$(cheapest)}`
		}
		const noDate = await this.backend.candidates({
			ageYears: age,
			maxPriceCents: p.budgetCents ?? undefined,
		})
		if (noDate.length) {
			const fastest = Math.min(...noDate.map((x) => x.deliveryDays))
			return `the date: nothing arrives within ${days} working days, the fastest takes ${fastest}`
		}
		return 'the age: nothing in stock suits that age'
	}

	private async compose(
		mode: ComposeMode,
		facts: Facts,
		c: Conversation,
		allowedCents: number[],
	): Promise<{ text: string; guarded: string | null }> {
		// What goes into the cart is stated by code, not worded by the model:
		// it once said the batteries were added when they were not.
		if (mode === 'applied')
			return { text: fallback(mode, facts), guarded: 'template' }
		let text = ''
		try {
			text = await this.llm.text(composePrompt(mode, facts, c.history), {
				temperature: 0.4,
				maxTokens: 220,
			})
		} catch (e) {
			return {
				text: fallback(mode, facts),
				guarded: `llm error: ${(e as Error).message.slice(0, 160)}`,
			}
		}
		const invented = inventedAmounts(text, allowedCents)
		if (!text || invented.length) {
			return {
				text: fallback(mode, facts),
				guarded: invented.length
					? `invented ${invented.map(usd).join(', ')}`
					: 'empty',
			}
		}
		// The cart changes only by code: on agreement, or when an edit in
		// words touches what is already in it. It once said "I have removed
		// all items from your cart" when only the proposal was empty.
		if (!facts.inCart && claimsCartChange(text))
			return { text: fallback(mode, facts), guarded: 'cart claim' }
		if (!facts.secondGiftUpTo && OFFER_MORE.test(text))
			return { text: fallback(mode, facts), guarded: 'offer more' }
		// Product names may contain a guarded word ("Letterpress Birthday Card").
		const style = offStyle(text, JSON.stringify(facts))
		if (style) return { text: fallback(mode, facts), guarded: `style ${style}` }
		return { text, guarded: null }
	}
}

function constraints(c: Conversation): string {
	const { ageYears, budgetCents, neededBy, interests, alreadyHas } = c.profile
	return JSON.stringify([
		ageYears,
		budgetCents,
		neededBy,
		interests,
		alreadyHas,
	])
}

// Only a message that describes the gift can change the profile; "take the
// second one" must not add "second one" to the recipient's interests.
function merge(
	c: Conversation,
	r: Interpretation,
	today: string,
	message: string,
): void {
	const p = c.profile
	if (r.intent !== 'info') return
	if (r.recipient && p.recipient === null) p.recipient = r.recipient
	if (r.ageYears !== null && r.ageYears >= 0 && r.ageYears <= 120)
		p.ageYears = r.ageYears
	if (r.budgetUsd !== null && r.budgetUsd > 0)
		p.budgetCents = Math.round(r.budgetUsd * 100)
	if (r.isBirthday) p.isBirthday = true
	const date = resolveWhen(today, {
		weekday: r.neededByWeekday,
		date: r.neededByDate,
		inDays: r.neededByInDays,
	})
	if (date) p.neededBy = date
	// For a birthday gift the date asked for is the birthday.
	if (p.isBirthday && p.neededBy) p.birthdayOn = p.neededBy
	const interests = r.interests.map((s) => s.trim()).filter(Boolean)
	// The model sets anyGiftOk on messages that say nothing of the kind ("he
	// turns 9"), so it counts only as the answer to that question or next to
	// words that mean it.
	const saysAny =
		c.lastAsked === 'interests' ||
		/\b(any(thing)?|whatever|no idea|not sure|don'?t know)\b/i.test(message)
	if (!interests.length && r.anyGiftOk && saysAny && !p.interests.length)
		interests.push('anything')
	if (interests.length) {
		const merged = [...new Set([...p.interests, ...interests])]
		// "anything" only stands in while nothing concrete is known.
		const concrete = merged.filter((s) => s.toLowerCase() !== 'anything')
		p.interests = concrete.length ? concrete : merged
	}
	const has = r.alreadyHas.map((s) => s.trim()).filter(Boolean)
	if (has.length) p.alreadyHas = [...new Set([...p.alreadyHas, ...has])]
}

// The discount as the shop's rule sees it, for the storefront's card and for
// fitting the budget. The backend applies the same rule to every quote.
function promotion(c: Conversation): Promotion | null {
	const p = c.profile
	if (!p.birthdayOn || !birthdayQualifies(c.today, p.birthdayOn)) return null
	return {
		label: BIRTHDAY_DISCOUNT.label,
		percent: BIRTHDAY_DISCOUNT.percent,
		withinWorkingDays: BIRTHDAY_DISCOUNT.withinWorkingDays,
		birthdayOn: p.birthdayOn,
		budgetCents: p.budgetCents,
		coversCents:
			p.budgetCents !== null
				? beforeDiscount(p.budgetCents, BIRTHDAY_DISCOUNT.percent)
				: null,
	}
}

function known(c: Conversation, $: (cents: number) => string): Facts {
	const p = c.profile
	return {
		recipient: p.recipient,
		ageYears: p.ageYears,
		budget: p.budgetCents !== null ? $(p.budgetCents) : null,
		neededBy: p.neededBy,
		interests: p.interests,
	}
}

// A statement, not a question: "Shall I put it in your cart?" is fine.
function claimsCartChange(text: string): boolean {
	return text
		.split(/(?<=[.?!])\s+/)
		.some(
			(sentence) =>
				!sentence.trim().endsWith('?') && CART_CHANGE.test(sentence),
		)
}

// An edit to items the conversation already put in the cart is made in the
// cart too; items only proposed stay proposed.
function syncCart(c: Conversation): TurnResponse['cartSet'] {
	const set: TurnResponse['cartSet'] = []
	for (const had of c.inCart) {
		const quantity = c.lines.find((l) => l.slug === had.slug)?.quantity ?? 0
		if (quantity !== had.quantity) set.push({ slug: had.slug, quantity })
	}
	c.inCart = c.inCart
		.map((l) => ({
			...l,
			quantity: set.find((x) => x.slug === l.slug)?.quantity ?? l.quantity,
		}))
		.filter((l) => l.quantity > 0)
	return set
}

function notIncluded(c: Conversation): ProductSummary[] {
	const inCart = new Set(c.lines.map((l) => l.slug))
	const out = new Map<string, ProductSummary>()
	for (const l of c.lines)
		for (const r of c.known.get(l.slug)?.requires ?? [])
			if (!inCart.has(r.slug)) out.set(r.slug, r)
	return [...out.values()]
}

function fallback(mode: ComposeMode, f: Facts): string {
	const s = (v: unknown) => String(v ?? '')
	switch (mode) {
		case 'ask':
			return s(f.question)
		case 'propose':
			return [
				`I would suggest the ${s((f.gift as string[])?.join(' and '))}.`,
				f.discount
					? `The birthday discount of ${s((f.discount as { percent: number }).percent)}% is applied, so the total is ${s(f.total)}.`
					: '',
				`That leaves ${s(f.remainder)} of your budget.`,
				f.secondGiftUpTo
					? `With the discount there is room for a second gift for up to ${s(f.secondGiftUpTo)}. Shall I put this one in your cart, or pick a second one too?`
					: 'Shall I put it in your cart?',
			]
				.filter(Boolean)
				.join(' ')
		case 'updated':
			return `Done${f.inCart ? ', your cart is updated too' : ''}. The total is now ${s(f.total)}${f.remainder ? `, with ${s(f.remainder)} left` : ''}.`
		case 'more':
			return `I would add ${s((f.added as { name: string }[])?.map((a) => a.name).join(' and '))}. The total is now ${s(f.total)}${f.remainder ? `, with ${s(f.remainder)} left` : ''}.`
		case 'no-more':
			return `Nothing in the shop matches that within the ${s(f.remainder)} that is left, so the proposal stays as it is.`
		case 'applied': {
			const items = (f.items as string[]) ?? []
			const missing = (f.notIncluded as string[]) ?? []
			return [
				`Putting ${list(items)} in your cart now.`,
				missing.length
					? `${list(missing)} ${missing.length === 1 ? 'is' : 'are'} not included and not in the cart.`
					: '',
			]
				.filter(Boolean)
				.join(' ')
		}
		case 'price':
			return `There are no promo codes, and prices here are fixed. The only discount is ${s(f.onlyDiscount)}${f.birthdayDiscountApplies ? ', and it is already applied' : ''}${f.total ? `. The total stays at ${s(f.total)}` : ''}.`
		case 'none-fit':
			return `Nothing in the shop fits because of ${s(f.reason)}. Could you change that?`
		default:
			return 'Is there anything you would like to change?'
	}
}

function list(names: string[]): string {
	if (names.length <= 1) return names[0] ?? 'it'
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
