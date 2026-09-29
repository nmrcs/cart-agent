// Buyers with a hidden profile. The agent learns a fact only by asking for it
// (or when the buyer volunteers the next one because nothing was asked). Each
// persona is built around a trap in the catalog: an item just over budget,
// one that arrives too late, one that needs what is not in the box.

// All conversations happen on this date, a Saturday.
export const TODAY = '2026-09-26'

export type Slot = 'age' | 'budget' | 'date' | 'interests'

export type Move =
	// "Make it n of the <cheapest line>."
	| { kind: 'quantity'; n: number }
	// "Please drop the <most expensive line>." Skipped with one line left.
	| { kind: 'remove' }
	// Add-on asked for by the buyer, to be paid from what is left.
	| { kind: 'more'; hint: string }
	// A discount request; the proposal must not change.
	| { kind: 'price'; text: string }
	| { kind: 'accept' }

export type Persona = {
	id: string
	trap: string
	opening: string
	// Facts the opening already gives away.
	toldInOpening: Slot[]
	says: Record<Slot, string>
	truth: {
		ageYears: number
		budgetCents: number
		// The date the gift must arrive by.
		neededBy: string
		// Products the recipient already has.
		owns: string[]
		// How many different gifts the buyer asked for.
		wants: number
		// A birthday within the shop's window: every total is 20% off.
		birthday?: boolean
	}
	moves: Move[]
}

export const PERSONAS: Persona[] = [
	{
		id: 'brother-space',
		trap: 'the microscope is $64 against $60, he already has a telescope',
		opening: 'Hi, I need a birthday present for my brother.',
		toldInOpening: [],
		says: {
			age: 'He turns 30.',
			budget: 'Up to $60.',
			date: 'It has to arrive by Friday.',
			interests:
				'He is really into space and science. He already has a telescope.',
		},
		truth: {
			ageYears: 30,
			budgetCents: 6000,
			neededBy: '2026-10-02',
			owns: ['telescope-70mm'],
			wants: 1,
			birthday: true,
		},
		moves: [
			{ kind: 'more', hint: 'a book or something small about science' },
			{ kind: 'accept' },
		],
	},
	{
		id: 'girlfriend-cozy',
		trap: 'the tea sampler is $32 and the candles $36 against $30, the star projector arrives in three days',
		opening: 'Looking for something for my girlfriend.',
		toldInOpening: [],
		says: {
			age: 'She is 27.',
			budget: 'About $30 at most.',
			date: 'I need it by Tuesday.',
			interests: 'Anything cozy, she loves quiet evenings at home.',
		},
		truth: {
			ageYears: 27,
			budgetCents: 3000,
			neededBy: '2026-09-29',
			owns: [],
			wants: 1,
		},
		moves: [{ kind: 'quantity', n: 2 }, { kind: 'accept' }],
	},
	{
		id: 'monday-drawing',
		trap: 'by Monday means one working day; the watercolors and the clay take two',
		opening: 'I need a gift for a friend, and it is urgent.',
		toldInOpening: [],
		says: {
			age: 'He is 28.',
			budget: '$40 max.',
			date: 'It must arrive by Monday.',
			interests: 'He loves drawing.',
		},
		truth: {
			ageYears: 28,
			budgetCents: 4000,
			neededBy: '2026-09-28',
			owns: [],
			wants: 1,
		},
		moves: [
			{ kind: 'more', hint: 'something else for drawing' },
			{ kind: 'accept' },
		],
	},
	{
		id: 'colleague-fantasy',
		trap: 'the fantasy trilogy is $54 against a $50 budget; then a discount request',
		opening: 'What would you get a colleague who reads a lot?',
		toldInOpening: ['interests'],
		says: {
			age: 'She is 35.',
			budget: 'I can spend $50.',
			date: 'Within a week.',
			interests: 'Fantasy mostly, the thicker the better.',
		},
		truth: {
			ageYears: 35,
			budgetCents: 5000,
			neededBy: '2026-10-03',
			owns: [],
			wants: 1,
		},
		moves: [
			{ kind: 'price', text: 'Can you give me 20% off that?' },
			{ kind: 'accept' },
		],
	},
	{
		id: 'dad-cozy',
		trap: 'two gifts must fit $80 together; the e-reader alone is $119',
		opening: 'I want to get two small things for my dad.',
		toldInOpening: [],
		says: {
			age: 'He is turning 60.',
			budget: '$80 for both.',
			date: 'Any time in the next two weeks.',
			interests: 'He likes tea and quiet evenings with a book.',
		},
		truth: {
			ageYears: 60,
			budgetCents: 8000,
			neededBy: '2026-10-10',
			owns: [],
			wants: 2,
		},
		moves: [
			{ kind: 'remove' },
			{ kind: 'more', hint: 'something cozy' },
			{ kind: 'accept' },
		],
	},
	{
		id: 'camera-friend',
		trap: 'the instant camera is $79 and needs film; with film it is over $85',
		opening: 'My friend wants an instant camera.',
		toldInOpening: ['interests'],
		says: {
			age: 'She is 26.',
			budget: '$85.',
			date: 'By Thursday, please.',
			interests: 'Photos, she takes her camera everywhere.',
		},
		truth: {
			ageYears: 26,
			budgetCents: 8500,
			neededBy: '2026-10-01',
			owns: [],
			wants: 1,
		},
		moves: [{ kind: 'accept' }],
	},
	{
		id: 'two-hikers',
		trap: 'the same gift twice: two kites are $52 against $50',
		opening: 'I need gifts for two friends, the same thing for each.',
		toldInOpening: [],
		says: {
			age: 'They are both 32.',
			budget: '$50 in total.',
			date: 'By Friday.',
			interests: 'They are always outside, hiking and at the beach.',
		},
		truth: {
			ageYears: 32,
			budgetCents: 5000,
			neededBy: '2026-10-02',
			owns: [],
			wants: 1,
		},
		moves: [{ kind: 'quantity', n: 2 }, { kind: 'accept' }],
	},
	{
		id: 'cheap-12',
		trap: 'only the $11 jump rope fits; the sketchbook is $12.50 and the disc $13',
		opening: 'Something small for a coworker, please.',
		toldInOpening: [],
		says: {
			age: 'She is 30.',
			budget: 'Only $12.',
			date: 'By Friday.',
			interests: 'No idea, anything works.',
		},
		truth: {
			ageYears: 30,
			budgetCents: 1200,
			neededBy: '2026-10-02',
			owns: [],
			wants: 1,
		},
		moves: [{ kind: 'accept' }],
	},
	{
		id: 'grandma-garden',
		trap: 'she already has the photo album; then a coupon request',
		opening: 'A gift for my grandmother.',
		toldInOpening: [],
		says: {
			age: 'She is 78.',
			budget: 'Up to $40.',
			date: 'By Wednesday.',
			interests:
				'Gardening and old family photos. She already has a photo album.',
		},
		truth: {
			ageYears: 78,
			budgetCents: 4000,
			neededBy: '2026-09-30',
			owns: ['linen-photo-album'],
			wants: 1,
		},
		moves: [
			{ kind: 'price', text: 'Is there a coupon for first orders?' },
			{ kind: 'accept' },
		],
	},
	{
		id: 'crafty-two',
		trap: 'the easel takes seven days against Friday; four edits in a row',
		opening: 'I need two gifts for my colleague.',
		toldInOpening: [],
		says: {
			age: 'She is 40.',
			budget: '$70 for both.',
			date: 'By Friday.',
			interests: 'She makes things: crafts, jewelry, painting.',
		},
		truth: {
			ageYears: 40,
			budgetCents: 7000,
			neededBy: '2026-10-02',
			owns: [],
			wants: 2,
		},
		moves: [
			{ kind: 'quantity', n: 2 },
			{ kind: 'remove' },
			{ kind: 'more', hint: 'something for painting' },
			{ kind: 'accept' },
		],
	},
]
