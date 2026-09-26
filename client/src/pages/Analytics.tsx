import { useEffect, useMemo, useState } from 'react'
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'

import { Brain, TrendingDown, TrendingUp } from 'lucide-react'

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAnalytics } from '@/lib/useAnalytics'

type PerformanceAnalysis = {
	weak_topics: { topic: string; accuracy: number; reason: string; suggestion: string }[]
	strong_topics: { topic: string; accuracy: number }[]
	overall_advice: string
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Request failed'
}

function getRetryAfterSeconds(error: unknown): number | null {
	const anyErr = error as { response?: { data?: { retryAfterSeconds?: unknown } } }
	const raw = anyErr?.response?.data?.retryAfterSeconds
	const n = typeof raw === 'string' ? Number(raw) : (raw as number)
	if (!Number.isFinite(n) || n <= 0) return null
	return Math.max(1, Math.trunc(n))
}

function useCooldownLabel(untilMs: number | null) {
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (!untilMs) return
		const t = window.setInterval(() => {
			const nextNow = Date.now()
			setNow(nextNow)
			if (nextNow >= untilMs) {
				window.clearInterval(t)
			}
		}, 250)
		return () => window.clearInterval(t)
	}, [untilMs])

	const remaining = untilMs ? Math.max(0, Math.ceil((untilMs - now) / 1000)) : 0
	return { remainingSeconds: remaining, isCoolingDown: remaining > 0 }
}

export default function AnalyticsPage() {
	const { analytics, isLoading, error, refresh } = useAnalytics()
	const [aiOpen, setAiOpen] = useState(false)
	const [aiLoading, setAiLoading] = useState(false)
	const [aiError, setAiError] = useState<string | null>(null)
	const [aiData, setAiData] = useState<PerformanceAnalysis | null>(null)
	const [aiCooldownUntil, setAiCooldownUntil] = useState<number | null>(null)
	const aiCooldown = useCooldownLabel(aiCooldownUntil)

	async function onAiAnalyze() {
		setAiError(null)
		setAiLoading(true)
		setAiOpen(true)
		try {
			const res = await api.post('/api/ai/performance-analysis', { days: 30 })
			setAiData(res.data as PerformanceAnalysis)
		} catch (e) {
			const retry = getRetryAfterSeconds(e)
			if (retry) setAiCooldownUntil(Date.now() + retry * 1000)
			setAiError(getErrorMessage(e))
		} finally {
			setAiLoading(false)
		}
	}

	const last14Data = useMemo(() => {
		const arr = analytics?.timeSeries ?? []
		return arr.slice(Math.max(0, arr.length - 14)).map((p) => ({
			date: p.date.slice(5),
			avg: Math.round(p.averagePercentage),
			attempts: p.attempts,
		}))
	}, [analytics])

	const totalAttempts = analytics?.totalQuizzesAttempted ?? 0
	const averageScore = analytics?.averagePercentage ?? 0

	const completionRate = useMemo(() => {
		const series = analytics?.timeSeries ?? []
		if (series.length === 0) return 0
		const activeDays = series.filter((d) => d.attempts > 0).length
		return Math.round((activeDays / series.length) * 100)
	}, [analytics])

	const avgTrend = useMemo(() => {
		const series = analytics?.timeSeries ?? []
		if (series.length < 2) return { direction: 'up' as const, delta: 0 }
		const a = series.slice(Math.max(0, series.length - 14))
		const mid = Math.floor(a.length / 2)
		const first = a.slice(0, mid)
		const second = a.slice(mid)
		const avg = (arr: typeof a) => (arr.length ? arr.reduce((s, x) => s + x.averagePercentage, 0) / arr.length : 0)
		const d = Math.round(avg(second) - avg(first))
		return { direction: d >= 0 ? ('up' as const) : ('down' as const), delta: Math.abs(d) }
	}, [analytics])

	const attemptsTrend = useMemo(() => {
		const series = analytics?.timeSeries ?? []
		if (series.length < 2) return { direction: 'up' as const, delta: 0 }
		const a = series.slice(Math.max(0, series.length - 14))
		const mid = Math.floor(a.length / 2)
		const sum = (arr: typeof a) => arr.reduce((s, x) => s + x.attempts, 0)
		const d = sum(a.slice(mid)) - sum(a.slice(0, mid))
		return { direction: d >= 0 ? ('up' as const) : ('down' as const), delta: Math.abs(d) }
	}, [analytics])


	const insightText = useMemo(() => {
		const trend = avgTrend.delta
		const dir = avgTrend.direction
		const focus = (analytics?.topicStats ?? []).slice().sort((a, b) => a.averagePercentage - b.averagePercentage)[0]?.topic
		if (!analytics) return 'Complete a few quizzes to unlock personalized insights.'
		const change = trend === 0 ? 'stayed consistent' : `${dir === 'up' ? 'improved' : 'dropped'} by ${trend}%`
		return `Your performance ${change} recently. ${focus ? `Focus more on ${focus} to improve further.` : 'Keep practicing to strengthen weaker topics.'}`
	}, [analytics, avgTrend])

	const strongTopics = useMemo((): { topic: string; score: number }[] => {
		const stats = analytics?.topicStats ?? []
		return stats
			.slice()
			.sort((a, b) => b.averagePercentage - a.averagePercentage)
			.slice(0, 5)
			.map((t) => ({ topic: t.topic, score: Math.round(t.averagePercentage) }))
	}, [analytics])

	const weakTopics = useMemo((): { topic: string; score: number }[] => {
		const stats = analytics?.topicStats ?? []
		return stats
			.slice()
			.sort((a, b) => a.averagePercentage - b.averagePercentage)
			.slice(0, 5)
			.map((t) => ({ topic: t.topic, score: Math.round(t.averagePercentage) }))
	}, [analytics])

	const monthlyData = useMemo(() => {
		const series = analytics?.timeSeries ?? []
		const map = new Map<string, { month: string; avg: number; attempts: number; count: number }>()
		for (const p of series) {
			const month = p.date.slice(0, 7)
			const existing = map.get(month) ?? { month, avg: 0, attempts: 0, count: 0 }
			existing.avg += p.averagePercentage
			existing.attempts += p.attempts
			existing.count += 1
			map.set(month, existing)
		}
		return Array.from(map.values())
			.sort((a, b) => a.month.localeCompare(b.month))
			.map((m) => ({ month: m.month.slice(5), avg: Math.round(m.avg / Math.max(1, m.count)), attempts: m.attempts }))
	}, [analytics])

	return (
		<section className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-1">
					<h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">Analytics</h1>
					<p className="text-sm text-slate-500 dark:text-slate-300">Insights from your learning progress</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onAiAnalyze}
						disabled={aiLoading || aiCooldown.isCoolingDown}
						className="inline-flex h-10 items-center justify-center rounded-2xl bg-indigo-500 px-4 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-indigo-600 hover:shadow-md active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed dark:bg-emerald-500 dark:text-slate-900 dark:hover:bg-emerald-400"
					>
						{aiLoading
							? 'Analyzing…'
							: aiCooldown.isCoolingDown
								? `Try again in ${aiCooldown.remainingSeconds}s`
								: 'AI Insights'}
					</button>
					<button
						type="button"
						onClick={refresh}
						disabled={isLoading}
						className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-md active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
					>
						Refresh
					</button>
				</div>
			</div>

			<Modal open={aiOpen} onOpenChange={setAiOpen} title="AI Insights" description="Personalized suggestions based on the last 30 days" className="max-w-3xl">
				<div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
					{aiError ? (
						<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
							{aiError}
						</div>
					) : null}
					{aiLoading ? (
						<div className="space-y-3">
							<div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" />
							<div className="h-24 w-full rounded bg-slate-200 dark:bg-slate-700" />
							<div className="h-24 w-full rounded bg-slate-200 dark:bg-slate-700" />
						</div>
					) : aiData ? (
						<div className="space-y-4">
							<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
								<CardHeader className="pb-0">
									<CardTitle className="text-slate-900 dark:text-slate-100">Overall advice</CardTitle>
									<CardDescription>Actionable guidance based on your recent activity.</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-slate-700 dark:text-slate-200">{aiData.overall_advice || '—'}</p>
								</CardContent>
							</Card>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
									<CardHeader>
										<CardTitle className="text-slate-900 dark:text-slate-100">Strong topics</CardTitle>
										<CardDescription>Keep building momentum.</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										{(aiData.strong_topics ?? []).slice(0, 5).map((t) => (
											<div key={t.topic} className="space-y-2">
												<div className="flex items-center justify-between gap-3">
													<p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{t.topic}</p>
													<p className="text-sm font-semibold text-green-600 dark:text-green-400">{Math.round(t.accuracy)}%</p>
												</div>
												<div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
													<div className="h-full rounded-full bg-green-500" style={{ width: `${Math.max(0, Math.min(100, t.accuracy))}%` }} />
												</div>
											</div>
										))}
										{(aiData.strong_topics ?? []).length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-300">No strong topics yet.</p> : null}
									</CardContent>
								</Card>

								<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
									<CardHeader>
										<CardTitle className="text-slate-900 dark:text-slate-100">Weak topics</CardTitle>
										<CardDescription>Focus next to improve faster.</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										{(aiData.weak_topics ?? []).slice(0, 4).map((t) => (
											<div key={t.topic} className="space-y-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-950/40 dark:ring-slate-700">
												<div className="flex items-start justify-between gap-3">
													<p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{t.topic}</p>
													<p className="text-sm font-semibold text-red-600 dark:text-red-400">{Math.round(t.accuracy)}%</p>
												</div>
												<div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
													<div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(0, Math.min(100, t.accuracy))}%` }} />
												</div>
												<p className="text-xs text-slate-500 dark:text-slate-300">{t.reason}</p>
												<p className="text-xs text-slate-700 dark:text-slate-200">
													<span className="font-semibold">Try:</span> {t.suggestion}
												</p>
											</div>
										))}
										{(aiData.weak_topics ?? []).length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-300">No weak topics yet.</p> : null}
									</CardContent>
								</Card>
							</div>
						</div>
					) : (
						<p className="text-sm opacity-70">No analysis yet.</p>
					)}
				</div>
			</Modal>

			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
					{error}
				</div>
			) : null}

			{/* Metrics */}
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Total attempts"
					value={isLoading ? '—' : String(totalAttempts)}
					trend={attemptsTrend}
				/>
				<MetricCard
					label="Average score"
					value={isLoading ? '—' : `${Math.round(averageScore)}%`}
					trend={avgTrend}
				/>
				<MetricCard
					label="Completion rate"
					value={isLoading ? '—' : `${completionRate}%`}
					trend={{ direction: completionRate >= 50 ? 'up' : 'down', delta: Math.abs(50 - completionRate) }}
				/>
				<MetricCard
					label="Recommendation"
					value={isLoading ? '—' : averageScore >= 70 ? 'Advance' : averageScore >= 40 ? 'Practice' : 'Review'}
					trend={{ direction: averageScore >= 70 ? 'up' : averageScore >= 40 ? 'up' : 'down', delta: 0 }}
				/>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
					<CardHeader>
						<CardTitle className="text-slate-900 dark:text-slate-100">Performance (Last 14 Days)</CardTitle>
						<CardDescription>Smooth trend of your average score.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="h-72">
							{isLoading ? (
								<div className="h-full w-full space-y-3">
									<div className="grid grid-cols-10 gap-2">
										{Array.from({ length: 10 }).map((_, i) => (
											<Skeleton key={i} className="h-24 w-full" />
										))}
									</div>
									<Skeleton className="h-4 w-48" />
								</div>
							) : last14Data.length === 0 ? (
								<EmptyState title="No attempts yet" description="Complete a quiz to start seeing trends." />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<LineChart data={last14Data} margin={{ left: 6, right: 10, top: 10, bottom: 0 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
										<XAxis dataKey="date" tickLine={false} axisLine={false} />
										<YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={28} />
										<Tooltip />
										<Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5} dot={false} />
									</LineChart>
								</ResponsiveContainer>
							)
						}
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
					<CardHeader>
						<CardTitle className="text-slate-900 dark:text-slate-100">Monthly Progress</CardTitle>
						<CardDescription>Average score aggregated by month.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="h-72">
							{isLoading ? (
								<div className="h-full w-full space-y-3">
									<div className="grid grid-cols-8 gap-2">
										{Array.from({ length: 8 }).map((_, i) => (
											<Skeleton key={i} className="h-24 w-full" />
										))}
									</div>
									<Skeleton className="h-4 w-48" />
								</div>
							) : monthlyData.length === 0 ? (
								<EmptyState title="No data yet" description="Monthly progress will appear after more attempts." />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={monthlyData} margin={{ left: 6, right: 10, top: 10, bottom: 0 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
										<XAxis dataKey="month" tickLine={false} axisLine={false} />
										<YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={28} />
										<Tooltip />
										<Bar dataKey="avg" fill="#6366f1" radius={[8, 8, 0, 0]} />
									</BarChart>
								</ResponsiveContainer>
							)
						}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Summary + Insights */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 lg:col-span-2">
					<CardHeader>
						<CardTitle className="text-slate-900 dark:text-slate-100">Performance summary</CardTitle>
						<CardDescription>Strong vs weak topics at a glance.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div className="space-y-4">
								<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Strong topics</p>
								{isLoading ? (
									<div className="space-y-3">
										<Skeleton className="h-5 w-full" />
										<Skeleton className="h-5 w-full" />
										<Skeleton className="h-5 w-full" />
									</div>
								) : strongTopics.length === 0 ? (
									<p className="text-sm text-slate-500 dark:text-slate-300">No topic data yet.</p>
								) : (
									strongTopics.map((t) => (
										<div key={t.topic} className="space-y-2">
											<div className="flex items-center justify-between gap-3">
												<p className="truncate text-sm text-slate-700 dark:text-slate-200">{t.topic}</p>
												<p className="text-sm font-semibold text-green-600 dark:text-green-400">{t.score}%</p>
											</div>
											<div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
												<div className="h-full rounded-full bg-green-500" style={{ width: `${t.score}%` }} />
											</div>
										</div>
									))
								)
							}
						</div>

							<div className="space-y-4">
								<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Weak topics</p>
								{isLoading ? (
									<div className="space-y-3">
										<Skeleton className="h-5 w-full" />
										<Skeleton className="h-5 w-full" />
										<Skeleton className="h-5 w-full" />
									</div>
								) : weakTopics.length === 0 ? (
									<p className="text-sm text-slate-500 dark:text-slate-300">No topic data yet.</p>
								) : (
									weakTopics.map((t) => (
										<div key={t.topic} className="space-y-2">
											<div className="flex items-center justify-between gap-3">
												<p className="truncate text-sm text-slate-700 dark:text-slate-200">{t.topic}</p>
												<p className="text-sm font-semibold text-red-600 dark:text-red-400">{t.score}%</p>
											</div>
											<div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
												<div className="h-full rounded-full bg-red-500" style={{ width: `${t.score}%` }} />
											</div>
										</div>
									))
								)
							}
						</div>
						</div>
					</CardContent>
					<CardFooter className="flex-col items-start gap-3">
						<div className="w-full">
							<div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
								<span>Average score</span>
								<span>{Math.round(averageScore)}%</span>
							</div>
							<Progress value={averageScore} className="mt-2" />
						</div>
						<div className="w-full">
							<div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
								<span>Improvement potential</span>
								<span>{Math.round(Math.max(0, 100 - averageScore))}%</span>
							</div>
							<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
								<div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(100, 100 - averageScore))}%` }} />
							</div>
						</div>
					</CardFooter>
				</Card>

				<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
					<CardHeader>
						<CardTitle className="text-slate-900 dark:text-slate-100">Insights</CardTitle>
						<CardDescription>Smart guidance to improve faster.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20">
								<Brain size={18} />
							</div>
							<p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{insightText}</p>
						</div>
						<div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-950/40 dark:ring-slate-800">
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Next best step</p>
							<p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Open a quiz and target your weakest topic for 10 minutes.</p>
						</div>
					</CardContent>
				</Card>
			</div>

		</section>
	)
}

function MetricCard({
	label,
	value,
	trend,
}: {
	label: string
	value: string
	trend: { direction: 'up' | 'down'; delta: number }
}) {
	const up = trend.direction === 'up'
	const Icon = up ? TrendingUp : TrendingDown
	const trendColor = up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
	return (
		<Card className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:bg-slate-800 dark:ring-slate-700">
			<CardHeader className="pb-0">
				<CardDescription className="text-sm">{label}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
				<div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
					<Icon size={14} />
					<span>{trend.delta === 0 ? 'Stable' : `${trend.delta}${label.includes('%') ? '%' : ''}`}</span>
					<span className="text-slate-500 dark:text-slate-300 font-medium">vs prev</span>
				</div>
			</CardContent>
		</Card>
	)
}
