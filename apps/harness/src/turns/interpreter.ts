import type { ChatMessage } from '../llm/llm.service'

export type Intent = 'info' | 'accept' | 'change' | 'more' | 'price' | 'other'

export const WEEKDAYS = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
] as const

// What the shopper said about the date, not the date itself: the calendar is
// code's job. A 9B model resolved "by Monday", said on a Saturday, to the
// Monday after next. Three flat fields: nested nullable objects it left empty.
export type When = {
	weekday: (typeof WEEKDAYS)[number] | null
	date: string | null
	inDays: number | null
}

export type Interpretation = {
	recipient: string | null
	ageYears: number | null
	budgetUsd: number | null
	neededByWeekday: When['weekday']
	neededByDate: string | null
	neededByInDays: number | null
	anyGiftOk: boolean
	interests: string[]
	alreadyHas: string[]
	itemsWanted: number | null
	isBirthday: boolean
	intent: Intent
	changes: { item: string; quantity: number }[]
	moreHint: string | null
}

const nullable = (type: string) => ({ type: [type, 'null'] })

// `items` is the closed list of ids the shopper can refer to: the proposed
// lines and the alternatives. The schema's enum makes any other id impossible.
export function interpretationSchema(items: string[]): object {
	return {
		type: 'object',
		additionalProperties: false,
		required: [
			'recipient',
			'ageYears',
			'budgetUsd',
			'neededByWeekday',
			'neededByDate',
			'neededByInDays',
			'anyGiftOk',
			'interests',
			'alreadyHas',
			'itemsWanted',
			'isBirthday',
			'intent',
			'changes',
			'moreHint',
		],
		properties: {
			recipient: nullable('string'),
			ageYears: nullable('integer'),
			budgetUsd: nullable('number'),
			neededByWeekday: { anyOf: [{ type: 'null' }, { enum: [...WEEKDAYS] }] },
			neededByDate: nullable('string'),
			neededByInDays: nullable('integer'),
			anyGiftOk: { type: 'boolean' },
			interests: { type: 'array', items: { type: 'string' } },
			alreadyHas: { type: 'array', items: { type: 'string' } },
			itemsWanted: nullable('integer'),
			isBirthday: { type: 'boolean' },
			intent: { enum: ['info', 'accept', 'change', 'more', 'price', 'other'] },
			changes: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['item', 'quantity'],
					properties: {
						item: { enum: items.length ? items : ['none'] },
						quantity: { type: 'integer' },
					},
				},
			},
			moreHint: nullable('string'),
		},
	}
}

export function interpretationPrompt(ctx: {
	today: string
	weekday: string
	lastAssistant: string | null
	proposal: { slug: string; name: string; quantity: number }[]
	alternatives: { slug: string; name: string }[]
	message: string
}): ChatMessage[] {
	const system = `You read one message from a shopper in a gift shop chat and fill in a form. Today is ${ctx.weekday}, ${ctx.today}.
Fill in only what the shopper's last message states or answers. Use null or [] for everything else; earlier answers are kept elsewhere.
- recipient: who the gift is for, in a few words ("brother", "my mom").
- ageYears: the recipient's age in whole years. "turns 9" is 9. A baby of 18 months is 1.
- budgetUsd: the most they want to spend, in dollars. "under 60 bucks" is 60.
- neededByWeekday: the weekday the gift must arrive by, if they name one ("by Monday", "next Friday"). Do not turn it into a date.
- neededByDate: a calendar date they give, as YYYY-MM-DD.
- neededByInDays: a number of days they give ("within a week" is 7).
- interests: short phrases for what the recipient likes, only when the shopper describes the recipient. Never guess.
- anyGiftOk: true only if the shopper says any gift will do or they do not know what the recipient likes.
- alreadyHas: things the recipient already owns.
- itemsWanted: how many different gifts they want, only if they say it.
- isBirthday: true when the gift is for the recipient's birthday ("he turns 30", "a birthday present"). A date they give is then the birthday.
- intent: "accept" when they agree to the proposed cart ("yes", "looks good, add it", "put both in my cart"); "change" when they change a quantity, drop an item or take an alternative instead of a proposed item; "more" when they want another gift in addition to the proposed one ("a second gift", "add something for hiking too"); "price" when they ask for a discount, a coupon, a lower price or a different total; "info" when they give details about the gift; "other" for anything else.
- changes: only for "change". item is one of the listed ids; quantity is the new count; 0 removes the item. When they take something "instead" of a proposed item or swap it, the proposed item gets quantity 0 and the new one gets 1.
- moreHint: only for "more", what kind of extra they want, if they say.`
	const lines = [
		`Assistant's last message: ${ctx.lastAssistant ?? '(none yet)'}`,
		`Proposed cart: ${ctx.proposal.length ? ctx.proposal.map((p) => `${p.slug} = ${p.name} x${p.quantity}`).join('; ') : '(nothing proposed yet)'}`,
		`Alternatives: ${ctx.alternatives.length ? ctx.alternatives.map((a) => `${a.slug} = ${a.name}`).join('; ') : '(none)'}`,
		`Shopper's message: ${ctx.message}`,
	]
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: lines.join('\n') },
	]
}
