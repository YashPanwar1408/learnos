import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

type DocumentItem = {
	_id: string
	title: string
}

type PracticeProblem = {
	difficulty: 'Easy' | 'Medium' | 'Hard'
	question: string
	solution: string
	explanation: string
}

type PracticeLabResponse = {
	problems: PracticeProblem[]
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

export default function PracticeLabPage() {
	const [documents, setDocuments] = useState<DocumentItem[]>([])
	const [selectedId, setSelectedId] = useState<string>('')
	const [isDocsLoading, setIsDocsLoading] = useState(true)
	const [docsError, setDocsError] = useState<string | null>(null)

	const [data, setData] = useState<PracticeLabResponse | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
	const cooldown = useCooldownLabel(cooldownUntil)

	const grouped = useMemo(() => {
		const problems = data?.problems || []
		return {
			Easy: problems.filter((p) => p.difficulty === 'Easy'),
			Medium: problems.filter((p) => p.difficulty === 'Medium'),
			Hard: problems.filter((p) => p.difficulty === 'Hard'),
		}
	}, [data])

	const fetchDocs = useCallback(async () => {
		setDocsError(null)
		setIsDocsLoading(true)
		try {
			const res = await api.get('/api/documents')
			const list = (res.data as { documents?: DocumentItem[] })?.documents
			const next = Array.isArray(list) ? list : []
			setDocuments(next)
			setSelectedId((prev) => prev || (next[0]?._id ? next[0]._id : ''))
		} catch (e) {
			setDocsError(getErrorMessage(e))
			setDocuments([])
		} finally {
			setIsDocsLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchDocs()
	}, [fetchDocs])

	async function onGenerate() {
		if (!selectedId) return
		setError(null)
		setIsLoading(true)
		try {
			const res = await api.post('/api/ai/practice-lab', { documentId: selectedId }, { timeout: 65000 })
			const payload = res.data as Partial<PracticeLabResponse>
			if (!payload || !Array.isArray(payload.problems)) throw new Error('Invalid practice lab returned')
			setData({ problems: payload.problems as PracticeProblem[] })
		} catch (e) {
			const anyErr = e as { code?: unknown }
			if (anyErr?.code === 'ECONNABORTED') {
				setError('Practice lab generation timed out. Please try again.')
				setData(null)
				return
			}
			const retry = getRetryAfterSeconds(e)
			if (retry) setCooldownUntil(Date.now() + retry * 1000)
			setError(getErrorMessage(e))
			setData(null)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<section className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-2xl font-semibold tracking-tight">Practice Lab</h2>
				<p className="text-sm text-muted-foreground">Generate mixed practice problems (conceptual + applied) from your PDF.</p>
			</div>

			{docsError ? <p className="text-sm text-destructive">{docsError}</p> : null}

			<Card className="card">
				<CardHeader>
					<CardTitle>Generate practice problems</CardTitle>
					<CardDescription>Select a document and generate Easy/Medium/Hard problems with solutions.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<Label htmlFor="doc">Document</Label>
					<div>
						<select
							id="doc"
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
							disabled={isDocsLoading || documents.length === 0}
							value={selectedId}
							onChange={(e) => setSelectedId(e.target.value)}
						>
							{documents.map((d) => (
								<option key={d._id} value={d._id}>
									{d.title}
								</option>
							))}
						</select>
					</div>
				</CardContent>
				<CardFooter className="justify-end">
					<Button type="button" onClick={onGenerate} disabled={!selectedId || isLoading || cooldown.isCoolingDown}>
						{isLoading ? 'Generating…' : cooldown.isCoolingDown ? `Try again in ${cooldown.remainingSeconds}s` : 'Generate'}
					</Button>
				</CardFooter>
			</Card>


			<Card className="card">
				<CardHeader>
					<CardTitle>Workspace</CardTitle>
					<CardDescription>Full-screen practice problems with solutions and explanations.</CardDescription>
				</CardHeader>
				<CardContent>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<div className="mt-3 h-[70vh] overflow-y-auto rounded-lg border border-border bg-background p-3">
						{isLoading ? (
							<p className="text-sm text-muted-foreground">Generating practice problems…</p>
						) : data ? (
							<div className="space-y-4">
								{(['Easy', 'Medium', 'Hard'] as const).map((level) => (
									<div key={level} className="space-y-3">
										<p className="text-sm font-medium">{level}</p>
										{grouped[level].map((p, idx) => (
											<div key={idx} className="rounded-md border border-border bg-background p-3">
												<p className="text-sm font-medium">Q{idx + 1}. {p.question}</p>
												<p className="mt-2 text-sm whitespace-pre-wrap"><span className="font-medium">Solution:</span> {p.solution}</p>
												<p className="mt-2 text-sm whitespace-pre-wrap"><span className="font-medium">Explanation:</span> {p.explanation}</p>
											</div>
										))}
										{grouped[level].length === 0 ? (
											<p className="text-sm text-muted-foreground">No {level} problems returned.</p>
										) : null}
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">Generate a lab to start practicing.</p>
						)}
					</div>
				</CardContent>
			</Card>
		</section>
	)
}
