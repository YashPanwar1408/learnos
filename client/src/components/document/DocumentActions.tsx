import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { api } from '@/lib/api'
import { normalizeMarkdownForDisplay } from '@/lib/markdownMath'

type Props = {
	documentId: string
}

type StudyPlanItem = {
	stage: string
	topics: string[]
	description: string
	estimated_time: number
	difficulty: 'Easy' | 'Medium' | 'Hard'
}

type StudyPlanResponse = {
	study_plan: StudyPlanItem[]
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

export function DocumentActions({ documentId }: Props) {
	const [activeModal, setActiveModal] = useState<null | 'summary' | 'explain' | 'plan'>(null)

	const [summary, setSummary] = useState<string>('')
	const [topic, setTopic] = useState('')
	const [explanation, setExplanation] = useState<string>('')
	const [studyPlan, setStudyPlan] = useState<StudyPlanResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isSummaryLoading, setIsSummaryLoading] = useState(false)
	const [isExplainLoading, setIsExplainLoading] = useState(false)
	const [isPlanLoading, setIsPlanLoading] = useState(false)
	const [summaryCooldownUntil, setSummaryCooldownUntil] = useState<number | null>(null)
	const [explainCooldownUntil, setExplainCooldownUntil] = useState<number | null>(null)
	const [planCooldownUntil, setPlanCooldownUntil] = useState<number | null>(null)

	const summaryCooldown = useCooldownLabel(summaryCooldownUntil)
	const explainCooldown = useCooldownLabel(explainCooldownUntil)
	const planCooldown = useCooldownLabel(planCooldownUntil)

	const canExplain = useMemo(() => topic.trim().length > 0 && !isExplainLoading && !explainCooldown.isCoolingDown, [topic, isExplainLoading, explainCooldown.isCoolingDown])
	const normalizedSummary = useMemo(() => normalizeMarkdownForDisplay(summary), [summary])
	const normalizedExplanation = useMemo(() => normalizeMarkdownForDisplay(explanation), [explanation])
	// Render formatted views (no raw JSON panels).

	async function onSummary() {
		setError(null)
		setIsSummaryLoading(true)
		try {
			const res = await api.post('/api/ai/summary', { documentId })
			const s = (res.data as { summary?: unknown })?.summary
			setSummary(typeof s === 'string' ? s : '')
			setActiveModal('summary')
		} catch (e) {
			const retry = getRetryAfterSeconds(e)
			if (retry) setSummaryCooldownUntil(Date.now() + retry * 1000)
			setError(getErrorMessage(e))
		} finally {
			setIsSummaryLoading(false)
		}
	}

	async function onExplain() {
		const trimmed = topic.trim()
		if (!trimmed) return
		setError(null)
		setIsExplainLoading(true)
		try {
			const res = await api.post('/api/ai/explain', { documentId, topic: trimmed })
			const text = (res.data as { explanation?: unknown })?.explanation
			setExplanation(typeof text === 'string' ? text : '')
			setActiveModal('explain')
		} catch (e) {
			const retry = getRetryAfterSeconds(e)
			if (retry) setExplainCooldownUntil(Date.now() + retry * 1000)
			setError(getErrorMessage(e))
		} finally {
			setIsExplainLoading(false)
		}
	}

	async function onStudyPlan() {
		setError(null)
		setIsPlanLoading(true)
		try {
			const res = await api.post('/api/ai/study-plan', { documentId })
			const data = res.data as Partial<StudyPlanResponse>
			if (!data || !Array.isArray(data.study_plan)) {
				throw new Error('Invalid study plan returned')
			}
			setStudyPlan({ study_plan: data.study_plan as StudyPlanItem[] })
			setActiveModal('plan')
		} catch (e) {
			const retry = getRetryAfterSeconds(e)
			if (retry) setPlanCooldownUntil(Date.now() + retry * 1000)
			setError(getErrorMessage(e))
			setStudyPlan(null)
		} finally {
			setIsPlanLoading(false)
		}
	}

	return (
		<div className="space-y-4">
			<Modal
				open={activeModal !== null}
				onOpenChange={(open) => {
					if (!open) setActiveModal(null)
				}}
				title={activeModal === 'summary' ? 'Summary' : activeModal === 'explain' ? 'Explanation' : activeModal === 'plan' ? 'Study Plan' : ''}
			>
				{activeModal === 'summary' ? (
					<div className="max-h-[min(70vh,520px)] overflow-y-auto pr-2">
						<div className="prose prose-sm max-w-none prose-slate dark:prose-invert">
							<ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
								{normalizedSummary}
							</ReactMarkdown>
						</div>
					</div>
				) : null}
				{activeModal === 'explain' ? (
					<div className="max-h-[min(70vh,520px)] overflow-y-auto pr-2">
						<div className="prose prose-sm max-w-none prose-slate dark:prose-invert">
							<ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
								{normalizedExplanation}
							</ReactMarkdown>
						</div>
					</div>
				) : null}
				{activeModal === 'plan' && studyPlan ? (
					<div className="max-h-[min(70vh,520px)] overflow-y-auto pr-2">
						<div className="space-y-3">
							{studyPlan.study_plan.map((s, idx) => (
								<div key={idx} className="rounded-lg border border-border bg-background p-3">
									<p className="text-sm font-medium">{s.stage}</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{s.difficulty} • {s.estimated_time} min
									</p>
									<p className="mt-2 text-sm">{s.description}</p>
									{s.topics?.length ? (
										<ul className="mt-2 list-disc pl-5 text-sm">
											{s.topics.map((t, tIdx) => (
												<li key={tIdx}>{t}</li>
											))}
										</ul>
									) : null}
								</div>
							))}
						</div>
					</div>
				) : null}
			</Modal>
			{error ? <p className="text-sm text-destructive">{error}</p> : null}

			<Card>
				<CardHeader>
					<CardTitle>Generate Summary</CardTitle>
					<CardDescription>Get a concise summary of the entire document.</CardDescription>
				</CardHeader>
				<CardFooter className="justify-end">
					<Button type="button" onClick={onSummary} disabled={isSummaryLoading || summaryCooldown.isCoolingDown}>
						{isSummaryLoading ? 'Summarizing…' : summaryCooldown.isCoolingDown ? `Try again in ${summaryCooldown.remainingSeconds}s` : 'Summarize'}
					</Button>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Explain a Concept</CardTitle>
					<CardDescription>Explain a topic from (or related to) this document.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<Label htmlFor="topic">Topic</Label>
					<div className="flex gap-2">
						<Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder='e.g. "React Hooks"' />
						<Button type="button" onClick={onExplain} disabled={!canExplain}>
							{isExplainLoading ? 'Explaining…' : explainCooldown.isCoolingDown ? `Try again in ${explainCooldown.remainingSeconds}s` : 'Explain'}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Study Plan</CardTitle>
					<CardDescription>Generate a step-by-step study plan from this document.</CardDescription>
				</CardHeader>
				<CardFooter className="justify-end">
					<Button type="button" onClick={onStudyPlan} disabled={isPlanLoading || planCooldown.isCoolingDown}>
						{isPlanLoading ? 'Generating…' : planCooldown.isCoolingDown ? `Try again in ${planCooldown.remainingSeconds}s` : 'Generate plan'}
					</Button>
				</CardFooter>
			</Card>
		</div>
	)
}
