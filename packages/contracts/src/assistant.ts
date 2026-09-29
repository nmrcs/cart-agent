import { z } from 'zod'
import { ProductSummary } from './catalog'
import { Cart } from './cart'
import { Promotion } from './promotion'
import { Quote } from './quote'

export const TurnRequest = z.object({
	conversationId: z.string().uuid().optional(),
	message: z.string().trim().min(1).max(1000),
	// Tests and the bench pin the date; the store uses the real one.
	today: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
})
export type TurnRequest = z.infer<typeof TurnRequest>

// What the profiler has learned so far. Null means still unknown.
export const Profile = z.object({
	recipient: z.string().nullable(),
	ageYears: z.number().int().nullable(),
	budgetCents: z.number().int().nullable(),
	neededBy: z.string().nullable(),
	interests: z.array(z.string()),
	alreadyHas: z.array(z.string()),
	// The gift is for the recipient's birthday; the date asked for is then
	// the birthday, which is also when the gift has to arrive.
	isBirthday: z.boolean(),
	birthdayOn: z.string().nullable(),
})
export type Profile = z.infer<typeof Profile>

export const TraceStep = z.object({
	step: z.string(),
	ms: z.number(),
	detail: z.string().optional(),
})
export type TraceStep = z.infer<typeof TraceStep>

// Model calls and tokens spent on one turn: the price of a conversation.
export const Usage = z.object({
	calls: z.number().int(),
	promptTokens: z.number().int(),
	completionTokens: z.number().int(),
})
export type Usage = z.infer<typeof Usage>

export const TurnResponse = z.object({
	conversationId: z.string().uuid(),
	// True when this turn started the conversation. Conversations live in the
	// harness's memory, so after a restart a known id comes back fresh.
	fresh: z.boolean(),
	reply: z.string(),
	profile: Profile,
	// The proposed cart, priced by the backend. It is not the buyer's cart
	// until they accept it.
	proposal: Quote.nullable(),
	remainderCents: z.number().int().nullable(),
	// What the proposed items need and do not include. Named, never added.
	notIncluded: z.array(ProductSummary),
	// True when the buyer agreed in words: the client moves the proposal into
	// the cart through the backend.
	applyProposal: z.boolean(),
	// The birthday discount once the backend's rule says it applies. The
	// storefront shows it as its own card.
	promotion: Promotion.nullable(),
	// Items this conversation already put in the cart that the buyer changed
	// in words: the backend sets these quantities exactly, 0 removes the line.
	cartSet: z.array(
		z.object({
			slug: z.string(),
			quantity: z.number().int().min(0).max(99),
		}),
	),
	trace: z.array(TraceStep),
	usage: Usage,
})
export type TurnResponse = z.infer<typeof TurnResponse>

// A turn streams as newline-delimited JSON: one event per pipeline step as it
// starts, then the turn itself. Most of a turn is waiting on the model, and
// the steps show the shopper where the time goes.
export const TurnEvent = z.discriminatedUnion('type', [
	z.object({ type: z.literal('step'), step: z.string() }),
	z.object({ type: z.literal('turn'), turn: TurnResponse }),
	z.object({ type: z.literal('error'), message: z.string() }),
])
export type TurnEvent = z.infer<typeof TurnEvent>

// What the harness proposed last in a conversation, as ids and quantities.
export const ProposalLines = z.object({
	birthdayOn: z.string().nullable(),
	lines: z.array(
		z.object({
			slug: z.string(),
			quantity: z.number().int().min(1).max(99),
		}),
	),
})
export type ProposalLines = z.infer<typeof ProposalLines>

// The browser talks to the backend only; the backend forwards the turn to
// the harness and owns the cart.
export const AssistantTurnRequest = z.object({
	cartId: z.string().uuid(),
	conversationId: z.string().uuid().optional(),
	message: z.string().trim().min(1).max(1000),
})
export type AssistantTurnRequest = z.infer<typeof AssistantTurnRequest>

// The backend's stream: the harness steps, then the turn with the cart as it
// is after the turn. The cart changes only when the shopper agreed in words.
export const AssistantEvent = z.discriminatedUnion('type', [
	z.object({ type: z.literal('step'), step: z.string() }),
	z.object({
		type: z.literal('turn'),
		turn: TurnResponse,
		cart: Cart.nullable(),
	}),
	z.object({ type: z.literal('error'), message: z.string() }),
])
export type AssistantEvent = z.infer<typeof AssistantEvent>

// "Add to cart" on a proposal: the backend asks the harness what it proposed
// and puts that in the cart, priced from the catalog.
export const ApplyProposalRequest = z.object({
	cartId: z.string().uuid(),
	conversationId: z.string().uuid(),
})
export type ApplyProposalRequest = z.infer<typeof ApplyProposalRequest>
