import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

export type LearnerToday = {
	user: { name: string; plan: string }
	mission: { title: string; subtitle: string; progress: number; remaining: string; documentId: string | null }
	recommendation: { title: string; description: string; to: string }
	intelligence: { mastery: number; retention: number; confidence: number; streak: number }
	weakConcepts: { name: string; mastery: number; attempts: number; reason: string; action: string }[]
	strongConcepts: { name: string; mastery: number }[]
	recentActivity: { _id?: string; label: string; createdAt?: string }[]
	upcomingReviews: { id: string; question: string; source: string }[]
	insight: string
}

export function useLearnerToday() {
	const [data, setData] = useState<LearnerToday | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const refresh = useCallback(async () => {
		setIsLoading(true)
		setError(null)
		try {
			const response = await api.get<LearnerToday>('/api/learner/today')
			setData(response.data)
		} catch (requestError) {
			const message = (requestError as { response?: { data?: { message?: unknown } } }).response?.data?.message
			setError(typeof message === 'string' ? message : 'Learner Twin is unavailable right now.')
		} finally {
			setIsLoading(false)
		}
	}, [])
	useEffect(() => { refresh() }, [refresh])
	return { data, isLoading, error, refresh }
}