import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
} from '@nestjs/common'
import {
	type Cart,
	type Quote,
	QuoteRequest,
	SetCartItemRequest,
} from '@cart-agent/contracts'
import { CartsService } from './carts.service'

@Controller()
export class CartsController {
	constructor(private readonly carts: CartsService) {}

	@Post('carts')
	create(): Promise<Cart> {
		return this.carts.create()
	}

	@Get('carts/:id')
	view(@Param('id', ParseUUIDPipe) id: string): Promise<Cart> {
		return this.carts.view(id)
	}

	@Put('carts/:id/items/:slug')
	setItem(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('slug') slug: string,
		@Body() body: unknown,
	): Promise<Cart> {
		const parsed = SetCartItemRequest.safeParse(body)
		if (!parsed.success) throw new BadRequestException(parsed.error.issues)
		return this.carts.setItem(id, slug, parsed.data.quantity)
	}

	@Delete('carts/:id/items/:slug')
	removeItem(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('slug') slug: string,
	): Promise<Cart> {
		return this.carts.setItem(id, slug, 0)
	}

	@Post('quotes')
	quote(@Body() body: unknown): Promise<Quote> {
		const parsed = QuoteRequest.safeParse(body)
		if (!parsed.success) throw new BadRequestException(parsed.error.issues)
		return this.carts.quote(parsed.data)
	}
}
