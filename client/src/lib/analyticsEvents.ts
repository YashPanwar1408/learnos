export const ANALYTICS_INVALIDATED_EVENT = 'alp:analytics-invalidated'

export function invalidateAnalytics(reason?: string) {
	window.dispatchEvent(new CustomEvent(ANALYTICS_INVALIDATED_EVENT, { detail: { reason } }))
}

export function onAnalyticsInvalidated(handler: (reason?: string) => void) {
	function onEvent(e: Event) {
		const ce = e as CustomEvent<{ reason?: string }>
		handler(ce.detail?.reason)
	}
	window.addEventListener(ANALYTICS_INVALIDATED_EVENT, onEvent)
	return () => window.removeEventListener(ANALYTICS_INVALIDATED_EVENT, onEvent)
}
