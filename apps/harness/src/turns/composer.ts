import type { ChatMessage } from '../llm/llm.service'

export type ComposeMode =
	| 'ask'
	| 'propose'
	| 'updated'
	| 'more'
	| 'no-more'
	| 'applied'
	| 'none-fit'
	| 'price'
	| 'other'

const TASKS: Record<ComposeMode, string> = {
	ask: 'Ask facts.question, in your own words if you like. Nothing else.',
	// Built from the facts present: a sentence about an empty field makes the
	// model talk about it anyway ("items not included" with none).
	propose: '',
	updated:
		'Confirm the change in one sentence and give the new total (facts.total, after facts.discount if given) and what is left of the budget (facts.remainder). If facts.inCart is true, the change is made in their cart as well; otherwise only the proposal changed, so do not mention the cart. If facts.problems is not empty, explain it.',
	more: 'Suggest the added items by name with their reasons, then give the new total (facts.total) and what is left (facts.remainder).',
	'no-more':
		'Say that nothing in the shop matches what they asked for (facts.asked, if given) within the money left (facts.remainder), and that the current proposal stays as it is.',
	// Written by a template in the service, never by the model.
	applied: '',
	'none-fit':
		'Say that nothing in the shop fits, give the reason from facts.reason, and ask whether they can change it.',
	price:
		'Say plainly that there are no promo codes and prices are fixed. Say that the only discount in the shop is facts.onlyDiscount, and if facts.birthdayDiscountApplies is true, that it is already applied to this order. If facts.total is given, the total stays at that.',
	other:
		'Answer briefly from the facts. If the message has nothing to do with the gift, bring the conversation back to it.',
}

export function composePrompt(
	mode: ComposeMode,
	facts: Record<string, unknown>,
	history: ChatMessage[],
): ChatMessage[] {
	return [
		{
			role: 'system',
			content: `You are the shopping assistant of an online gift shop, writing your next chat message to a shopper.
- Use only the facts given. Any price you mention must be copied exactly from the facts. Do not add, subtract or estimate amounts.
- One to three short sentences. Plain and warm, no exclamation marks, no "Great choice", no emojis, no lists or markdown.
- The shopper sees a card with the proposed items and prices, so do not list every line with its price.
- Until the task says the items are going into the cart now, they are a proposal: never say anything was added to the cart.
- Do not open with praise or small talk ("It is wonderful", "What a lovely idea"). Do not call anything perfect.
- Mention only things that are in the facts. Do not invent products, cards, wrapping or services.
- Speak as "I", not "we". A question is one short sentence.
- Never suggest adding more items or using up the rest of the budget unless the task asks for it.
Task: ${mode === 'propose' ? proposeTask(facts) : TASKS[mode]}`,
		},
		// The conversation goes in as text, not as chat roles: some chat
		// templates reject a window that starts with an assistant turn.
		{
			role: 'user',
			content: `Conversation so far:\n${transcript(history.slice(-6))}\n\nFacts for your reply: ${JSON.stringify(compact(facts))}`,
		},
	]
}

// Empty lists and nulls are left out: the model tends to talk about a field it
// was shown even when there is nothing in it.
function compact(facts: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(facts).filter(
			([, v]) =>
				v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
		),
	)
}

function transcript(history: ChatMessage[]): string {
	return history
		.map((m) => `${m.role === 'user' ? 'Shopper' : 'Assistant'}: ${m.content}`)
		.join('\n')
}

function proposeTask(facts: Record<string, unknown>): string {
	const has = (k: string) =>
		Array.isArray(facts[k]) ? (facts[k] as unknown[]).length > 0 : !!facts[k]
	return [
		'Recommend facts.gift by name in one sentence, using facts.reasons.',
		has('remainder')
			? 'Say how much of the budget is left (facts.remainder).'
			: '',
		has('alternatives')
			? 'Name facts.alternatives briefly as other options.'
			: '',
		has('notIncluded')
			? 'Say that facts.notIncluded are not included, and that you can add them if the shopper wants.'
			: '',
		has('discount')
			? 'Say that the birthday discount (facts.discount) is applied, and give the total after it (facts.total).'
			: '',
		has('problems') ? 'Explain facts.problems.' : '',
		has('secondGiftUpTo')
			? 'End by asking whether to put it in their cart, or whether they would like a second gift for up to facts.secondGiftUpTo, which the discount makes room for.'
			: 'End by asking whether to put it in their cart.',
	]
		.filter(Boolean)
		.join(' ')
}
