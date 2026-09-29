// Delivery is promised in working days, so "by Saturday" is counted in them:
// the working days after today up to and including the date.
export function workingDaysUntil(today: string, date: string): number {
	const start = Date.parse(`${today}T00:00:00Z`)
	const end = Date.parse(`${date}T00:00:00Z`)
	let days = 0
	for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
		const weekday = new Date(t).getUTCDay()
		if (weekday !== 0 && weekday !== 6) days++
	}
	return days
}

export function weekdayName(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'long',
		timeZone: 'UTC',
	})
}

export function localToday(): string {
	const d = new Date()
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WEEKDAY_INDEX: Record<string, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
}

// The nearest such weekday after today: said on a Saturday, "by Monday" is
// the day after tomorrow, and "next Friday" is six days away.
export function resolveWhen(
	today: string,
	when: { weekday: string | null; date: string | null; inDays: number | null },
): string | null {
	const base = Date.parse(`${today}T00:00:00Z`)
	const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
	if (when.date && /^\d{4}-\d{2}-\d{2}$/.test(when.date)) return when.date
	if (when.weekday && when.weekday in WEEKDAY_INDEX) {
		const from = new Date(base).getUTCDay()
		const ahead = (WEEKDAY_INDEX[when.weekday] - from + 7) % 7 || 7
		return iso(base + ahead * 86_400_000)
	}
	if (when.inDays !== null && when.inDays >= 0 && when.inDays <= 365)
		return iso(base + when.inDays * 86_400_000)
	return null
}
