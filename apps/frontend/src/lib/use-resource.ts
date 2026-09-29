import { useCallback, useEffect, useState } from 'react'

type State<T> = { data: T | null; error: Error | null; loading: boolean }

// Loads once per key; a newer key wins over a slower older response.
export function useResource<T>(key: string, load: () => Promise<T>) {
	const [state, setState] = useState<State<T>>({
		data: null,
		error: null,
		loading: true,
	})
	const [attempt, setAttempt] = useState(0)

	useEffect(() => {
		let current = true
		setState((s) => ({ data: s.data, error: null, loading: true }))
		load().then(
			(data) => current && setState({ data, error: null, loading: false }),
			(error: Error) =>
				current && setState({ data: null, error, loading: false }),
		)
		return () => {
			current = false
		}
		// `load` is recreated every render; the key is what identifies the request.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, attempt])

	const retry = useCallback(() => setAttempt((n) => n + 1), [])
	return { ...state, retry }
}
