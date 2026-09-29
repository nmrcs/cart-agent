import type { Candidate, Quote, QuoteRequest } from '@cart-agent/contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env'

// The harness has no database. Everything it knows about products, stock and
// prices comes from the backend through these two calls.
@Injectable()
export class BackendClient {
	private readonly base: string

	constructor(config: ConfigService<Env, true>) {
		this.base = config.get('BACKEND_URL', { infer: true }).replace(/\/$/, '')
	}

	candidates(q: {
		ageYears?: number
		maxPriceCents?: number
		maxDeliveryDays?: number
		exclude?: string[]
	}): Promise<Candidate[]> {
		const params = new URLSearchParams()
		if (q.ageYears !== undefined) params.set('ageYears', String(q.ageYears))
		if (q.maxPriceCents !== undefined)
			params.set('maxPriceCents', String(q.maxPriceCents))
		if (q.maxDeliveryDays !== undefined)
			params.set('maxDeliveryDays', String(q.maxDeliveryDays))
		if (q.exclude?.length) params.set('exclude', q.exclude.join(','))
		return this.request(`/candidates?${params}`)
	}

	// The birthday and today go along so the backend can apply its discount
	// rule; the harness never names a percent.
	quote(
		lines: QuoteRequest['lines'],
		opts: { birthdayOn?: string | null; today?: string } = {},
	): Promise<Quote> {
		return this.request('/quotes', {
			method: 'POST',
			body: JSON.stringify({
				lines,
				...(opts.birthdayOn ? { birthdayOn: opts.birthdayOn } : {}),
				...(opts.today ? { today: opts.today } : {}),
			}),
		})
	}

	private async request<T>(path: string, init?: RequestInit): Promise<T> {
		const res = await fetch(`${this.base}${path}`, {
			...init,
			headers: { 'Content-Type': 'application/json' },
		})
		if (!res.ok) throw new Error(`backend ${res.status} on ${path}`)
		return res.json() as Promise<T>
	}
}
