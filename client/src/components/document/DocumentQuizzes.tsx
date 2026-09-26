import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { invalidateAnalytics } from '@/lib/analyticsEvents'

type QuizQuestion = {
	_id: string
	question: string
	difficulty?: 'easy' | 'medium' | 'hard'
	options: string[]
	correctOptionIndex?: number
	correctAnswer?: string
	explanation?: string
}

type Quiz = {
	_id: string
	title: string
	topic?: string | null
	targetDifficulty?: 'easy' | 'medium' | 'hard' | null
	questions: QuizQuestion[]
}

type QuizPersonalization = {
	topic: string
	strength: number
	targetDifficulty: 'easy' | 'medium' | 'hard'
}

type QuizSubmitResult = {
	questionId: string
	question: string
	options: string[]
	selectedOptionIndex: number
	correctOptionIndex: number
	correctAnswer: string
	isCorrect: boolean
	explanation: string
}

type QuizSubmitResponse = {
	attemptId: string
	score: number
	total: number
	percentage: number
	results: QuizSubmitResult[]
	progress?: QuizPersonalization & {
		difficultyLevel?: 'easy' | 'medium' | 'hard'
		attempts?: number
		lastPercentage?: number
	}
}

type Props = {
	documentId: string
	documentTitle: string
}

function clampInt(value: unknown, { min, max, fallback }: { min: number; max: number; fallback: number }) {
	const n = typeof value === 'string' ? Number(value) : (value as number)
	if (!Number.isFinite(n)) return fallback
	const int = Math.trunc(n)
	if (int < min) return min
	if (int > max) return max
	return int
}

function formatTime(totalSeconds: number) {
	const safe = Math.max(0, Math.trunc(totalSeconds))
	const m = Math.floor(safe / 60)
	const s = safe % 60
	return `${m}:${String(s).padStart(2, '0')}`
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Something went wrong'
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

export function DocumentQuizzes({ documentId, documentTitle }: Props) {
	const [title, setTitle] = useState('')
	const [numQuestions, setNumQuestions] = useState(5)
	const [timerMinutes, setTimerMinutes] = useState(0)

	const [quiz, setQuiz] = useState<Quiz | null>(null)
	const [personalization, setPersonalization] = useState<QuizPersonalization | null>(null)
	const [currentIndex, setCurrentIndex] = useState(0)
	const [answers, setAnswers] = useState<Record<string, number>>({})
	const [submitResponse, setSubmitResponse] = useState<QuizSubmitResponse | null>(null)
	const [runNonce, setRunNonce] = useState(0)

	const [isGenerating, setIsGenerating] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [pageError, setPageError] = useState<string | null>(null)
	const [generateCooldownUntil, setGenerateCooldownUntil] = useState<number | null>(null)

	const generateCooldown = useCooldownLabel(generateCooldownUntil)

	const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
	const autoSubmittedRef = useRef(false)

	const totalQuestions = quiz?.questions?.length ?? 0
	const currentQuestion = quiz?.questions?.[currentIndex] ?? null
	const isLastQuestion = Boolean(quiz && currentIndex === totalQuestions - 1)

	const canGenerate = useMemo(() => !isGenerating && !generateCooldown.isCoolingDown, [isGenerating, generateCooldown.isCoolingDown])
	const selectedIndex = currentQuestion ? answers[currentQuestion._id] : undefined
	const canGoNext = Boolean(currentQuestion && Number.isInteger(selectedIndex) && selectedIndex! >= 0 && selectedIndex! <= 3)

	useEffect(() => {
		if (!quiz || submitResponse) return
		const minutes = clampInt(timerMinutes, { min: 0, max: 180, fallback: 0 })
		if (minutes <= 0) {
			setSecondsLeft(null)
			autoSubmittedRef.current = false
			return
		}
		setSecondsLeft(minutes * 60)
		autoSubmittedRef.current = false
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [runNonce, quiz?._id, submitResponse])

	useEffect(() => {
		if (!quiz || submitResponse) return
		if (secondsLeft === null) return
		if (secondsLeft <= 0) {
			if (!autoSubmittedRef.current) {
				autoSubmittedRef.current = true
				onSubmit()
			}
			return
		}
		const t = window.setInterval(() => {
			setSecondsLeft((prev) => (prev === null ? null : prev - 1))
		}, 1000)
		return () => window.clearInterval(t)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [secondsLeft, quiz?._id, submitResponse, runNonce])

	function resetRunState() {
		setCurrentIndex(0)
		setAnswers({})
		setSubmitResponse(null)
		setSecondsLeft(null)
		setPersonalization(null)
		autoSubmittedRef.current = false
	}

	async function onGenerate() {
		setPageError(null)
		setIsGenerating(true)
		try {
			const payload = {
				documentId,
				numQuestions: clampInt(numQuestions, { min: 1, max: 20, fallback: 5 }),
				title: title.trim() || documentTitle,
			}
			const res = await api.post('/api/quiz/generate', payload)
			const nextQuiz = (res.data as { quiz?: Quiz })?.quiz
			const p = (res.data as { personalization?: QuizPersonalization })?.personalization
			if (!nextQuiz?._id || !Array.isArray(nextQuiz.questions) || nextQuiz.questions.length === 0) {
				throw new Error('Invalid quiz returned')
			}
			setQuiz(nextQuiz)
			resetRunState()
			setPersonalization(p ?? null)
			setRunNonce((n) => n + 1)
		} catch (err) {
			const retry = getRetryAfterSeconds(err)
			if (retry) setGenerateCooldownUntil(Date.now() + retry * 1000)
			setPageError(getErrorMessage(err))
		} finally {
			setIsGenerating(false)
		}
	}

	function chooseOption(questionId: string, optionIndex: number) {
		setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
	}

	function onNext() {
		if (!quiz || !currentQuestion) return
		if (!canGoNext) return
		setCurrentIndex((i) => Math.min(i + 1, quiz.questions.length - 1))
	}

	async function onSubmit() {
		if (!quiz || isSubmitting) return
		setPageError(null)
		setIsSubmitting(true)
		try {
			const res = await api.post('/api/quiz/submit', {
				quizId: quiz._id,
				answers,
			})
			const data = res.data as Partial<QuizSubmitResponse>
			if (!data || typeof data.score !== 'number' || typeof data.total !== 'number' || !Array.isArray(data.results)) {
				throw new Error('Invalid submission response')
			}
			setSubmitResponse(data as QuizSubmitResponse)
			invalidateAnalytics('quiz-submit')
		} catch (err) {
			setPageError(getErrorMessage(err))
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div className="space-y-6">
			{pageError ? <p className="text-sm text-destructive">{pageError}</p> : null}

			{!quiz ? (
				<Card>
					<CardHeader>
						<CardTitle>Create a quiz</CardTitle>
						<CardDescription>Generate MCQs from this document.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div className="space-y-2 sm:col-span-1">
								<Label htmlFor="quiz-title">Title (optional)</Label>
								<Input
									id="quiz-title"
									placeholder={documentTitle}
									value={title}
									onChange={(e) => setTitle(e.target.value)}
								/>
							</div>
							<div className="space-y-2 sm:col-span-1">
								<Label htmlFor="quiz-questions">Questions</Label>
								<Input
									id="quiz-questions"
									type="number"
									min={1}
									max={20}
									value={numQuestions}
									onChange={(e) => setNumQuestions(clampInt(e.target.value, { min: 1, max: 20, fallback: 5 }))}
								/>
								<p className="text-xs text-muted-foreground">1–20 questions.</p>
							</div>
							<div className="space-y-2 sm:col-span-1">
								<Label htmlFor="quiz-timer">Timer (minutes)</Label>
								<Input
									id="quiz-timer"
									type="number"
									min={0}
									max={180}
									value={timerMinutes}
									onChange={(e) => setTimerMinutes(clampInt(e.target.value, { min: 0, max: 180, fallback: 0 }))}
								/>
								<p className="text-xs text-muted-foreground">Set 0 to disable.</p>
							</div>
						</div>
					</CardContent>
					<CardFooter className="justify-end gap-2">
						<Button
							variant="outline"
							type="button"
							onClick={() => {
								setTitle('')
								setNumQuestions(5)
								setTimerMinutes(0)
								setPageError(null)
							}}
							disabled={isGenerating}
						>
							Clear
						</Button>
						<Button type="button" onClick={onGenerate} disabled={!canGenerate}>
							{isGenerating ? 'Generating…' : generateCooldown.isCoolingDown ? `Try again in ${generateCooldown.remainingSeconds}s` : 'Generate quiz'}
						</Button>
					</CardFooter>
				</Card>
			) : submitResponse ? (
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>{quiz.title || 'Quiz results'}</CardTitle>
							<CardDescription>
								Score: <span className="font-medium">{submitResponse.score}</span> / {submitResponse.total} ({submitResponse.percentage}%)
							</CardDescription>
						</CardHeader>
						{submitResponse.progress ? (
							<CardContent className="space-y-1">
								<p className="text-sm text-muted-foreground">
									Topic: <span className="text-foreground font-medium">{submitResponse.progress.topic}</span>
									{' • '}Strength:{' '}
									<span className="text-foreground font-medium">{Math.round(submitResponse.progress.strength)}%</span>
									{' • '}Next difficulty:{' '}
									<span className="text-foreground font-medium">{submitResponse.progress.difficultyLevel || submitResponse.progress.targetDifficulty}</span>
								</p>
							</CardContent>
						) : null}
						<CardFooter className="justify-end gap-2">
							<Button
								variant="outline"
								type="button"
								onClick={() => {
									setQuiz(null)
									resetRunState()
								}}
							>
								New quiz
							</Button>
							<Button
								type="button"
								onClick={() => {
									resetRunState()
									setRunNonce((n) => n + 1)
								}}
							>
								Retake
							</Button>
						</CardFooter>
					</Card>

					<div className="space-y-3">
						{submitResponse.results.map((r, idx) => {
							const your = r.selectedOptionIndex >= 0 ? r.options[r.selectedOptionIndex] : 'No answer'
							const correct = r.options[r.correctOptionIndex] || r.correctAnswer
							return (
								<Card key={r.questionId}>
									<CardHeader>
										<CardTitle className="text-base">Q{idx + 1}. {r.question}</CardTitle>
										<CardDescription>
											<span className={r.isCorrect ? 'text-foreground' : 'text-destructive'}>
												{r.isCorrect ? 'Correct' : 'Incorrect'}
											</span>
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-2">
										<div className="text-sm">
											<div className="text-muted-foreground">Your answer</div>
											<div className="font-medium">{your}</div>
										</div>
										<div className="text-sm">
											<div className="text-muted-foreground">Correct answer</div>
											<div className="font-medium">{correct}</div>
										</div>
										{r.explanation ? (
											<div className="text-sm">
												<div className="text-muted-foreground">Explanation</div>
												<div className="whitespace-pre-wrap">{r.explanation}</div>
											</div>
										) : null}
									</CardContent>
								</Card>
							)
						})}
					</div>
				</div>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{quiz.title}</CardTitle>
						<CardDescription>
							{personalization ? `Target difficulty: ${personalization.targetDifficulty}` : 'Answer one question at a time.'}
							{secondsLeft !== null ? ` • Time left: ${formatTime(secondsLeft)}` : ''}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{currentQuestion ? (
							<>
								<div className="space-y-2">
									<p className="text-sm text-muted-foreground">Question {currentIndex + 1} of {totalQuestions}</p>
									<p className="text-base font-medium">{currentQuestion.question}</p>
								</div>
								<div className="grid grid-cols-1 gap-2">
									{currentQuestion.options.map((opt, i) => {
										const selected = answers[currentQuestion._id] === i
										return (
											<button
												key={i}
												type="button"
												onClick={() => chooseOption(currentQuestion._id, i)}
												className={
													'w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ' +
													(selected ? 'border-ring bg-muted' : 'border-border hover:bg-muted')
												}
											>
												{opt}
											</button>
										)
									})}
								</div>
							</>
						) : null}
					</CardContent>
					<CardFooter className="justify-end gap-2">
						<Button variant="outline" type="button" onClick={() => setQuiz(null)}>
							Exit
						</Button>
						{!isLastQuestion ? (
							<Button type="button" onClick={onNext} disabled={!canGoNext}>
								Next
							</Button>
						) : (
							<Button type="button" onClick={onSubmit} disabled={!canGoNext || isSubmitting}>
								{isSubmitting ? 'Submitting…' : 'Submit'}
							</Button>
						)}
					</CardFooter>
				</Card>
			)}
		</div>
	)
}
