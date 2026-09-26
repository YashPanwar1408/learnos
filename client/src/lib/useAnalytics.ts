import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { onAnalyticsInvalidated } from '@/lib/analyticsEvents'

export type TopicStat = {
	topic: string
	attempts: number
	averagePercentage: number
}

export type TimePoint = {
	date: string
	attempts: number
	averagePercentage: number
}

export type Analytics = {
	userId: string
	totalQuizzesAttempted: number
	averagePercentage: number
	strongTopics: TopicStat[]
	weakTopics: TopicStat[]
	topicStats: TopicStat[]
	timeSeries: TimePoint[]
	computedAt: string
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Something went wrong'
}

export function useAnalytics() {
	const [analytics, setAnalytics] = useState<Analytics | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const refresh = useCallback(async () => {
		setError(null)
		setIsLoading(true)
		try {
			const res = await api.get('/api/analytics')
			const a = (res.data as { analytics?: Analytics })?.analytics
			setAnalytics(a ?? null)
		} catch (err) {
			setError(getErrorMessage(err))
			setAnalytics(null)
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	useEffect(() => {
		return onAnalyticsInvalidated(() => {
			refresh()
		})
	}, [refresh])

	return { analytics, isLoading, error, refresh }
}
