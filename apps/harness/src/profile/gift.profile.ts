import type { Profile } from '@cart-agent/contracts'

// The store's questions, as data. A different shop swaps this file, not the
// harness. Order is the order they are asked in; each is asked only while its
// slot is empty, and only one per turn.
export type Slot = {
	key: 'recipient' | 'ageYears' | 'budgetCents' | 'neededBy' | 'interests'
	// The question itself. The composer may word it differently; the fallback
	// uses it as is.
	ask: string
	// Asked instead when the gift is for a birthday: the birthday is then
	// both the delivery date and what the birthday discount is judged on.
	askIfBirthday?: string
}

export const GIFT_QUESTIONS: Slot[] = [
	{ key: 'ageYears', ask: 'How old is the person the gift is for?' },
	{ key: 'budgetCents', ask: 'What is the most you want to spend?' },
	{
		key: 'neededBy',
		ask: 'When does the gift need to arrive?',
		askIfBirthday: 'When is the birthday?',
	},
	{
		key: 'interests',
		ask: 'What are they into? Or will any good gift do?',
	},
]

export const EMPTY_PROFILE: Profile = {
	recipient: null,
	ageYears: null,
	budgetCents: null,
	neededBy: null,
	interests: [],
	alreadyHas: [],
	isBirthday: false,
	birthdayOn: null,
}

export function nextQuestion(p: Profile): Slot | null {
	return (
		GIFT_QUESTIONS.find((q) =>
			q.key === 'interests' ? p.interests.length === 0 : p[q.key] === null,
		) ?? null
	)
}
