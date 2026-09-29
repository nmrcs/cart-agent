import {
	BadRequestException,
	Body,
	Controller,
	Logger,
	Post,
	Res,
} from '@nestjs/common'
import {
	type AssistantEvent,
	AssistantTurnRequest,
	ApplyProposalRequest,
	type Cart,
} from '@cart-agent/contracts'
import type { Response } from 'express'
import { CartsService } from '../carts/carts.service'
import { HarnessClient } from './harness.client'

@Controller('assistant')
export class AssistantController {
	private readonly logger = new Logger(AssistantController.name)

	constructor(
		private readonly harness: HarnessClient,
		private readonly carts: CartsService,
	) {}

	// Streams the harness's steps. If the shopper agreed or edited the cart in
	// words, the cart changes here, before the turn reaches the browser.
	@Post('turns')
	async turn(@Body() body: unknown, @Res() res: Response): Promise<void> {
		const parsed = AssistantTurnRequest.safeParse(body)
		if (!parsed.success) throw new BadRequestException(parsed.error.issues)
		const { cartId, conversationId, message } = parsed.data
		await this.carts.view(cartId)

		res.status(200)
		res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
		res.setHeader('Cache-Control', 'no-cache')
		res.flushHeaders()
		const send = (e: AssistantEvent) => res.write(`${JSON.stringify(e)}\n`)
		try {
			for await (const e of this.harness.turn({ conversationId, message })) {
				if (e.type !== 'turn') {
					send(e)
					continue
				}
				let cart: Cart | null = null
				if (e.turn.applyProposal && e.turn.proposal?.lines.length)
					cart = await this.carts.applyLines(
						cartId,
						e.turn.proposal.lines.map((l) => ({
							slug: l.product.slug,
							quantity: l.quantity,
						})),
						e.turn.profile.birthdayOn,
					)
				else if (e.turn.cartSet.length)
					cart = await this.carts.setLines(cartId, e.turn.cartSet)
				send({ type: 'turn', turn: e.turn, cart })
			}
		} catch (e) {
			this.logger.error({
				actionCode: 'assistant.turn.failed',
				message: (e as Error).message,
			})
			send({
				type: 'error',
				message: 'The assistant is not available right now.',
			})
		}
		res.end()
	}

	// "Add to cart" on a proposal card: what goes in is what the harness holds
	// as the proposal, not what the browser sends.
	@Post('proposal/apply')
	async apply(@Body() body: unknown): Promise<Cart> {
		const parsed = ApplyProposalRequest.safeParse(body)
		if (!parsed.success) throw new BadRequestException(parsed.error.issues)
		const { cartId, conversationId } = parsed.data
		const { lines, birthdayOn } = await this.harness.applied(conversationId)
		return this.carts.applyLines(cartId, lines, birthdayOn)
	}
}
