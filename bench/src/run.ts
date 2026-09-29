import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ProductDetail, Usage } from '@cart-agent/contracts'
import { products as seed } from '../../apps/backend/prisma/catalog'
import type { Agent, AgentTurn, Line } from './agent'
import { type Catalog, loadCatalog } from './catalog'
import {
	amountsOf,
	checkText,
	checkProposal,
	countViolations,
	type TextChecks,
	sameLines,
	payable,
	totalOf,
	type Violations,
} from './checks'
import { type Move, PERSONAS, type Persona, type Slot } from './personas'
import { CodeAgent } from './variants/code'
import { ModelAgent } from './variants/model'

// npm run bench -- --variants code,model --reps 3 --personas brother-space
// npm run bench -- --summarize runs/<time>   (a stopped run's summary)
// npm run bench -- --summarize runs/<time> --recheck   (checks rerun on the
//   recorded turns, against the seed catalog; no model, no database)
const args = parseArgs(process.argv.slice(2))
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3001'
const HARNESS = process.env.HARNESS_URL ?? 'http://localhost:3002'
const LLM_URL = process.env.LLM_URL ?? 'http://127.0.0.1:1234/v1'
const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen/qwen3.5-9b'

type Variant = 'code' | 'model'
const MAX_QUESTIONS = 8

type TurnLog = {
	buyer: string
	move: Move | null
	reply: string
	proposal: Line[] | null
	committed: Line[] | null
	usage: Usage
	ms: number
	violations?: Violations
	text: TextChecks
}

type EditResult = {
	kind: Move['kind']
	ok: boolean
	note: string
}

type Dialog = {
	persona: string
	variant: Variant
	rep: number
	turns: TurnLog[]
	questionsBeforeProposal: number | null
	proposedEarly: boolean
	edits: EditResult[]
	reachedCart: boolean
	error: string | null
}

// The buyer answers what was asked, from the persona's facts. Offered to be
// shown something, or told the agent is looking, it says to go ahead. Asked
// something it does not recognise, it volunteers the next fact it has not
// told yet.
const ASKS: Record<Slot, RegExp> = {
	age: /\bhow old\b|\bage\b/i,
	budget: /budget|spend|price range|how much/i,
	date: /\bwhen\b|deadline|what date|by what date|how soon/i,
	interests:
		/\binto\b|interest|hobb|enjoy|\bloves?\b|\bfan of\b|what (?:does|do|is) (?:he|she|they)\b[^?]*\blikes?\b|any good gift|preference|type of (?:item|gift)|any suitable/i,
}
// The harness often asks without a question mark: "Please let me know your
// budget so I can prepare the right selection.", "I need to ask what is the
// most you want to spend."
const REQUEST =
	/\b(?:let me know|tell me|need to know|need to ask|could you share|please share)\b/i
const OFFER =
	/\b(?:would you like|shall i|should i|do you want|want me to|may i|can i)\b[^?]*\b(?:see|show|propose|put|add|go ahead|proceed|suggest|look|check|recommend|search|find)\b/i
const ORDER: Slot[] = ['age', 'budget', 'date', 'interests']

function answer(reply: string, persona: Persona, told: Set<Slot>): string {
	const questions = reply
		.split(/(?<=[.?!])\s+/)
		.filter((s) => s.trim().endsWith('?') || REQUEST.test(s))
		.join(' ')
	// "Any option within your $60 budget?" asks about interests; a slot
	// already told is a recap unless nothing else was asked.
	const matched = ORDER.filter((s) => ASKS[s].test(questions))
	const fresh = matched.filter((s) => !told.has(s))
	const asked = fresh.length ? fresh : matched
	if (!asked.length && (!questions || OFFER.test(questions)))
		return 'Yes, please go ahead.'
	const slots = asked.length
		? asked
		: ORDER.filter((s) => !told.has(s)).slice(0, 1)
	for (const s of slots) told.add(s)
	return slots.length
		? slots.map((s) => persona.says[s]).join(' ')
		: 'Could you suggest something?'
}

function moveText(
	move: Move,
	lines: Line[],
	catalog: Catalog,
): { text: string; target?: string } | null {
	const name = (slug: string) => catalog.get(slug)?.name ?? slug
	const byPrice = [...lines].sort(
		(a, b) =>
			(catalog.get(a.slug)?.priceCents ?? 0) -
			(catalog.get(b.slug)?.priceCents ?? 0),
	)
	switch (move.kind) {
		case 'quantity': {
			const t = byPrice[0].slug
			return { text: `Make it ${move.n} of the ${name(t)}.`, target: t }
		}
		case 'remove': {
			if (lines.length < 2) return null
			const t = byPrice[byPrice.length - 1].slug
			return { text: `Please drop the ${name(t)}.`, target: t }
		}
		case 'more':
			return {
				text: `Could you add ${move.hint} with the money that is left?`,
			}
		case 'price':
			return { text: move.text }
		case 'accept':
			return { text: 'Yes, put it in my cart.' }
	}
}

function judgeEdit(
	move: Move,
	target: string | undefined,
	prev: Line[],
	t: AgentTurn,
	persona: Persona,
	catalog: Catalog,
): EditResult {
	const now = t.proposal
	switch (move.kind) {
		case 'quantity': {
			const expected = prev.map((l) =>
				l.slug === target ? { ...l, quantity: move.n } : l,
			)
			return {
				kind: move.kind,
				ok: sameLines(now, expected),
				note: `${target} x${move.n}`,
			}
		}
		case 'remove': {
			const expected = prev.filter((l) => l.slug !== target)
			return {
				kind: move.kind,
				ok: sameLines(now, expected),
				note: `drop ${target}`,
			}
		}
		case 'more': {
			const kept = prev.every((l) =>
				now?.some((n) => n.slug === l.slug && n.quantity === l.quantity),
			)
			const added = (now ?? []).filter(
				(n) => !prev.some((l) => l.slug === n.slug),
			)
			const fits = now
				? payable(totalOf(now, catalog), persona) <= persona.truth.budgetCents
				: true
			if (!added.length && sameLines(now, prev))
				return { kind: move.kind, ok: true, note: 'nothing added' }
			return {
				kind: move.kind,
				ok: kept && added.length > 0 && fits,
				note: `added ${added.map((a) => a.slug).join(', ') || 'nothing'}${kept ? '' : ', changed the rest'}${fits ? '' : ', over budget'}`,
			}
		}
		case 'price':
			return {
				kind: move.kind,
				ok: sameLines(now, prev),
				note: sameLines(now, prev) ? 'held' : 'proposal changed',
			}
		case 'accept':
			return {
				kind: move.kind,
				ok: t.committed !== null && sameLines(t.committed, prev),
				note: t.committed ? 'committed' : 'nothing committed',
			}
	}
}

async function dialog(
	persona: Persona,
	agent: Agent,
	catalog: Catalog,
): Promise<Omit<Dialog, 'persona' | 'variant' | 'rep'>> {
	const budget = persona.truth.budgetCents
	const told = new Set<Slot>(persona.toldInOpening)
	const seen = new Set<number>([budget])
	for (const p of catalog.values()) seen.add(p.priceCents)
	const turns: TurnLog[] = []
	const edits: EditResult[] = []
	let proposal: Line[] | null = null
	let questions = 0
	let proposedEarly = false
	let reachedCart = false

	const step = async (buyer: string, move: Move | null) => {
		const toldBefore = new Set(told)
		const t = await agent.turn(buyer)
		const changed = t.proposal !== null && !sameLines(t.proposal, proposal)
		let violations: Violations | undefined
		if (changed && t.proposal) {
			violations = checkProposal(t.proposal, proposal, move, persona, catalog)
			for (const a of amountsOf(t.proposal, budget, catalog, persona))
				seen.add(a)
			if (proposal === null)
				proposedEarly = ORDER.some((s) => !toldBefore.has(s))
		}
		const text = checkText(
			t.reply,
			{ proposal: t.proposal, prev: proposal, committed: t.committed, move },
			budget,
			seen,
			catalog,
			persona,
		)
		turns.push({ buyer, move, ...t, violations, text })
		return t
	}

	try {
		// Until the first proposal: answer questions.
		let buyer = persona.opening
		for (;;) {
			const t = await step(buyer, null)
			if (t.proposal) {
				proposal = t.proposal
				break
			}
			questions++
			if (questions >= MAX_QUESTIONS) break
			buyer = answer(t.reply, persona, told)
		}
		if (proposal) {
			for (const move of persona.moves) {
				const m = moveText(move, proposal, catalog)
				if (!m) continue
				const prev = proposal
				const t = await step(m.text, move)
				edits.push(judgeEdit(move, m.target, prev, t, persona, catalog))
				if (t.proposal) proposal = t.proposal
				if (move.kind === 'accept') reachedCart = edits.at(-1)!.ok
			}
		}
		return {
			turns,
			questionsBeforeProposal: proposal ? questions : null,
			proposedEarly,
			edits,
			reachedCart,
			error: null,
		}
	} catch (e) {
		return {
			turns,
			questionsBeforeProposal: null,
			proposedEarly,
			edits,
			reachedCart,
			error: (e as Error).message.slice(0, 300),
		}
	}
}

async function main(): Promise<void> {
	if (args.summarize) {
		const dir = path.resolve(__dirname, '..', args.summarize)
		const all = readFileSync(path.join(dir, 'dialogs.jsonl'), 'utf8')
			.trim()
			.split('\n')
			.map((l) => JSON.parse(l) as Dialog)
		if (args.recheck !== undefined) {
			const catalog = seedCatalog()
			for (const d of all) recheck(d, catalog)
			writeFileSync(
				path.join(dir, 'dialogs.jsonl'),
				all.map((d) => JSON.stringify(d)).join('\n') + '\n',
			)
		}
		const variants = [...new Set(all.map((d) => d.variant))]
		writeFileSync(path.join(dir, 'summary.md'), summary(all, variants))
		console.log(summary(all, variants))
		return
	}
	const variants = (args.variants ?? 'code,model').split(',') as Variant[]
	const reps = Number(args.reps ?? 3)
	const personas = args.personas
		? PERSONAS.filter((p) => args.personas!.split(',').includes(p.id))
		: PERSONAS
	const catalog = await loadCatalog(BACKEND)
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
	const dir = path.resolve(__dirname, '../runs', stamp)
	mkdirSync(dir, { recursive: true })
	const out = path.join(dir, 'dialogs.jsonl')
	const all: Dialog[] = []
	console.log(
		`${personas.length} personas x ${variants.join('+')} x ${reps} -> ${dir}`,
	)
	for (let rep = 1; rep <= reps; rep++)
		for (const persona of personas)
			for (const variant of variants) {
				const agent =
					variant === 'code'
						? new CodeAgent(HARNESS)
						: new ModelAgent(BACKEND, LLM_URL, LLM_MODEL)
				const start = Date.now()
				const d: Dialog = {
					persona: persona.id,
					variant,
					rep,
					...(await dialog(persona, agent, catalog)),
				}
				all.push(d)
				appendFileSync(out, `${JSON.stringify(d)}\n`)
				const bad = d.turns.reduce(
					(n, t) =>
						n +
						(t.violations ? countViolations(t.violations) : 0) +
						t.text.invented.length +
						(t.text.wrongTotal !== null ? 1 : 0) +
						(t.text.wrongRemainder !== null ? 1 : 0) +
						(t.text.offeredMore ? 1 : 0) +
						(t.text.falseCartClaim ? 1 : 0),
					0,
				)
				console.log(
					`${variant.padEnd(5)} ${persona.id.padEnd(15)} #${rep}  ${d.turns.length} turns  ${Math.round((Date.now() - start) / 1000)}s  violations ${bad}  edits ${d.edits.filter((e) => e.ok).length}/${d.edits.length}${d.error ? `  ERROR ${d.error}` : ''}`,
				)
			}
	writeFileSync(path.join(dir, 'summary.md'), summary(all, variants))
	console.log(summary(all, variants))
}

// The same checks as during the run, over the turns as they were recorded.
function recheck(d: Dialog, catalog: Catalog): void {
	const persona = PERSONAS.find((p) => p.id === d.persona)!
	const budget = persona.truth.budgetCents
	const seen = new Set<number>([budget])
	for (const p of catalog.values()) seen.add(p.priceCents)
	let proposal: Line[] | null = null
	for (const t of d.turns) {
		const changed = t.proposal !== null && !sameLines(t.proposal, proposal)
		t.violations = changed
			? checkProposal(t.proposal!, proposal, t.move, persona, catalog)
			: undefined
		if (changed)
			for (const a of amountsOf(t.proposal!, budget, catalog, persona))
				seen.add(a)
		t.text = checkText(
			t.reply,
			{
				proposal: t.proposal,
				prev: proposal,
				committed: t.committed,
				move: t.move,
			},
			budget,
			seen,
			catalog,
			persona,
		)
		proposal = t.proposal ?? proposal
	}
}

function seedCatalog(): Catalog {
	return new Map(seed.map((p) => [p.slug, p as unknown as ProductDetail]))
}

function summary(all: Dialog[], variants: Variant[]): string {
	const rows: [string, (ds: Dialog[]) => string][] = [
		['Dialogs', (ds) => String(ds.length)],
		['Ended with an error', (ds) => count(ds, (d) => d.error !== null)],
		['Reached the cart as proposed', (ds) => count(ds, (d) => d.reachedCart)],
		[
			'Dialogs with a money error',
			(ds) =>
				count(ds, (d) =>
					d.turns.some(
						(t) =>
							t.violations?.overBudget ||
							t.text.invented.length > 0 ||
							t.text.wrongTotal !== null ||
							t.text.wrongRemainder !== null,
					),
				),
		],
		[
			'  proposal over budget',
			(ds) => turns(ds, (t) => !!t.violations?.overBudget),
		],
		[
			'  reply with an invented amount',
			(ds) => turns(ds, (t) => t.text.invented.length > 0),
		],
		[
			'  wrong total in the reply',
			(ds) => turns(ds, (t) => t.text.wrongTotal !== null),
		],
		[
			'  wrong remainder in the reply',
			(ds) => turns(ds, (t) => t.text.wrongRemainder !== null),
		],
		[
			'Dialogs with a catalog error',
			(ds) =>
				count(ds, (d) =>
					d.turns.some(
						(t) =>
							!!t.violations &&
							t.violations.unknown.length +
								t.violations.outOfStock.length +
								t.violations.wrongAge.length +
								t.violations.late.length +
								t.violations.owned.length >
								0,
					),
				),
		],
		['  unknown product', (ds) => lines(ds, (v) => v.unknown)],
		['  out of stock', (ds) => lines(ds, (v) => v.outOfStock)],
		['  wrong age', (ds) => lines(ds, (v) => v.wrongAge)],
		['  arrives too late', (ds) => lines(ds, (v) => v.late)],
		['  already owned', (ds) => lines(ds, (v) => v.owned)],
		['Items added unasked', (ds) => lines(ds, (v) => v.unasked)],
		[
			'Replies offering more unasked',
			(ds) => turns(ds, (t) => t.text.offeredMore),
		],
		[
			'Replies claiming a cart change that did not happen',
			(ds) => turns(ds, (t) => t.text.falseCartClaim),
		],
		[
			'Proposed before all four answers',
			(ds) => count(ds, (d) => d.proposedEarly),
		],
		['Edits done right', (ds) => edits(ds)],
		...(['quantity', 'remove', 'more', 'price', 'accept'] as const).map(
			(k) =>
				[`  ${k}`, (ds: Dialog[]) => edits(ds, k)] as [
					string,
					(ds: Dialog[]) => string,
				],
		),
		[
			'Agent turns before the proposal, median',
			(ds) => median(ds.map((d) => d.questionsBeforeProposal)),
		],
		[
			'Model calls per dialog, median',
			(ds) => median(ds.map((d) => sum(d, (u) => u.calls))),
		],
		[
			'Tokens per dialog, median',
			(ds) =>
				median(
					ds.map((d) => sum(d, (u) => u.promptTokens + u.completionTokens)),
				),
		],
		[
			'Seconds per dialog, median',
			(ds) =>
				median(
					ds.map((d) =>
						Math.round(d.turns.reduce((s, t) => s + t.ms, 0) / 1000),
					),
				),
		],
	]
	const head = `| | ${variants.join(' | ')} |\n|---|${variants.map(() => '---:').join('|')}|`
	const body = rows
		.map(
			([label, f]) =>
				`| ${label} | ${variants.map((v) => f(all.filter((d) => d.variant === v))).join(' | ')} |`,
		)
		.join('\n')
	return `${head}\n${body}\n`
}

const count = (ds: Dialog[], f: (d: Dialog) => boolean) =>
	`${ds.filter(f).length}/${ds.length}`
const turns = (ds: Dialog[], f: (t: TurnLog) => boolean) =>
	String(ds.reduce((n, d) => n + d.turns.filter(f).length, 0))
const lines = (ds: Dialog[], f: (v: Violations) => string[]) =>
	String(
		ds.reduce(
			(n, d) =>
				n +
				d.turns.reduce(
					(m, t) => m + (t.violations ? f(t.violations).length : 0),
					0,
				),
			0,
		),
	)
const edits = (ds: Dialog[], kind?: Move['kind']) => {
	const es = ds.flatMap((d) => d.edits).filter((e) => !kind || e.kind === kind)
	return `${es.filter((e) => e.ok).length}/${es.length}`
}
const sum = (d: Dialog, f: (u: Usage) => number) =>
	d.turns.reduce((s, t) => s + f(t.usage), 0)
function median(xs: (number | null)[]): string {
	const s = xs.filter((x): x is number => x !== null).sort((a, b) => a - b)
	if (!s.length) return '-'
	const m = s.length >> 1
	return String(s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2))
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
	const out: Record<string, string> = {}
	for (let i = 0; i < argv.length; i++)
		if (argv[i].startsWith('--'))
			out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--')
				? ''
				: (argv[++i] ?? '')
	return out
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
