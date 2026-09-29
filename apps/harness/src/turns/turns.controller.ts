import {
	BadRequestException,
	Body,
	Controller,
	NotFoundException,
	Param,
	ParseUUIDPipe,
	Post,
	Res,
} from '@nestjs/common'
import {
	type ProposalLines,
	TurnRequest,
	type TurnEvent,
	type TurnResponse,
} from '@cart-agent/contracts'
import type { Response } from 'express'
import { ConversationStore } from './conversation.store'
import { TurnsService } from './turns.service'

@Controller()
export class TurnsController {
	constructor(
		private readonly turns: TurnsService,
		private readonly store: ConversationStore,
	) {}

	// Whole turn as one JSON body: scripts and the bench.
	@Post('turns')
	turn(@Body() body: unknown): Promise<TurnResponse> {
		return this.turns.turn(parse(body))
	}

	// The same turn as newline-delimited events, for the storefront.
	@Post('turns/stream')
	async stream(@Body() body: unknown, @Res() res: Response): Promise<void> {
		const req = parse(body)
		res.status(200)
		res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
		res.setHeader('Cache-Control', 'no-cache')
		res.flushHeaders()
		const send = (e: TurnEvent) => res.write(`${JSON.stringify(e)}\n`)
		try {
			send({
				type: 'turn',
				turn: await this.turns.turn(req, (step) =>
					send({ type: 'step', step }),
				),
			})
		} catch (e) {
			send({ type: 'error', message: (e as Error).message.slice(0, 300) })
		}
		res.end()
	}

	// "Add to cart" on the card: the backend asks what was proposed and puts
	// it in the cart; from here on, edits in words to it change the cart too.
	@Post('conversations/:id/proposal/applied')
	applied(@Param('id', ParseUUIDPipe) id: string): ProposalLines {
		const c = this.store.find(id)
		if (!c) throw new NotFoundException('conversation not found')
		c.inCart = c.lines.map((l) => ({ ...l }))
		return {
			birthdayOn: c.profile.birthdayOn,
			lines: c.lines.map((l) => ({ slug: l.slug, quantity: l.quantity })),
		}
	}
}

function parse(body: unknown): TurnRequest {
	const parsed = TurnRequest.safeParse(body)
	if (!parsed.success) throw new BadRequestException(parsed.error.issues)
	return parsed.data
}
