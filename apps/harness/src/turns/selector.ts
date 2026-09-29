import type { Candidate, Profile } from '@cart-agent/contracts'
import type { ChatMessage } from '../llm/llm.service'
import { usd } from './money-guard'

export type Pick = { slug: string; reason: string; fitsRequest: boolean }

// The model ranks, it does not search: the enum is the shortlist the backend
// already filtered, so a pick outside it cannot be expressed.
export function selectionSchema(slugs: string[]): object {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['picks'],
		properties: {
			picks: {
				type: 'array',
				maxItems: 5,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['slug', 'reason', 'fitsRequest'],
					properties: {
						slug: { enum: slugs },
						reason: { type: 'string' },
						// Judged per item: a small model ignores "return nothing"
						// but answers a yes/no about each line.
						fitsRequest: { type: 'boolean' },
					},
				},
			},
		},
	}
}

export function selectionPrompt(
	profile: Profile,
	candidates: Candidate[],
	hint: string | null,
): ChatMessage[] {
	const who = [
		profile.recipient,
		profile.ageYears !== null ? `${profile.ageYears} years old` : null,
		profile.interests.length ? `into ${profile.interests.join(', ')}` : null,
		profile.alreadyHas.length
			? `already has ${profile.alreadyHas.join(', ')}`
			: null,
	]
		.filter(Boolean)
		.join('; ')
	const list = candidates
		.map(
			(c) =>
				`${c.slug} | ${c.name} | ${usd(c.priceCents)} | ${c.category.name} | ${c.tags.join(', ')} | ${c.description.slice(0, 110)}`,
		)
		.join('\n')
	return [
		{
			role: 'system',
			content: `You help a shopper choose a gift from a shop's shortlist. Rank the best matches first, at most 5. Judge by the recipient's interests and age. Skip anything too close to what they already have. Each reason is under 12 words, concrete, and about the recipient, not the product's marketing. fitsRequest is true only if the item is what the shopper asks for; when there is no specific request, it is true.`,
		},
		{
			role: 'user',
			content: `Recipient: ${who || 'not described'}${hint ? `\nThe shopper asks for: ${hint}` : ''}\n\nShortlist (id | name | price | category | tags | description):\n${list}`,
		},
	]
}
