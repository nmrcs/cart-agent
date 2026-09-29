import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Query,
} from '@nestjs/common'
import {
	type Candidate,
	CandidateQuery,
	type Category,
	type ProductDetail,
	ProductListQuery,
	type ProductPage,
} from '@cart-agent/contracts'
import { CatalogService } from './catalog.service'

@Controller()
export class CatalogController {
	constructor(private readonly catalog: CatalogService) {}

	@Get('categories')
	categories(): Promise<Category[]> {
		return this.catalog.categories()
	}

	@Get('products')
	products(@Query() query: unknown): Promise<ProductPage> {
		const parsed = ProductListQuery.safeParse(query)
		if (!parsed.success) throw new BadRequestException(parsed.error.issues)
		return this.catalog.products(parsed.data)
	}

	@Get('products/:slug')
	product(@Param('slug') slug: string): Promise<ProductDetail> {
		return this.catalog.product(slug)
	}

	@Get('candidates')
	candidates(@Query() query: unknown): Promise<Candidate[]> {
		const parsed = CandidateQuery.safeParse(query)
		if (!parsed.success) throw new BadRequestException(parsed.error.issues)
		return this.catalog.candidates(parsed.data)
	}
}
