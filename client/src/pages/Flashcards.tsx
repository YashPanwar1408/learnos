import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { invalidateAnalytics } from '@/lib/analyticsEvents'

type Flashcard = {
	_id: string
	question: string
	answer: string
	lastRating: 'easy' | 'medium' | 'hard' | null
	repetitions: number
	intervalDays: number
	easeFactor: number
	lastReviewedAt: string | null
	nextReviewAt: string
	createdAt?: string
	updatedAt?: string
}

type Rating = 'easy' | 'medium' | 'hard'

function clampInt(value: unknown, { min, max, fallback }: { min: number; max: number; fallback: number }) {
	const n = typeof value === 'string' ? Number(value) : (value as number)
	if (!Number.isFinite(n)) return fallback
	const int = Math.trunc(n)
	if (int < min) return min
	if (int > max) return max
	return int
}

function formatDate(value: string | null | undefined) {
	if (!value) return ''
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleString()
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Something went wrong'
}

function isDue(nextReviewAt: string) {
	const d = new Date(nextReviewAt)
	if (Number.isNaN(d.getTime())) return false
	return d.getTime() <= Date.now()
}

function FlashcardFlip({
	card,
	isFlipped,
	onToggle,
	childrenBack,
}: {
	card: Flashcard
	isFlipped: boolean
	onToggle: () => void
	childrenBack: React.ReactNode
}) {
	return (
		<div
			className="perspective-[1000px]"
			role="button"
			tabIndex={0}
			onClick={onToggle}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') onToggle()
			}}
		>
			<div
				className={
					'relative min-h-55 w-full transition-transform duration-500 transform-3d ' +
					(isFlipped ? 'transform-[rotateY(180deg)]' : '')
				}
			>
				<div className="absolute inset-0 backface-hidden">
					<Card className="h-full">
						<CardHeader>
							<CardTitle className="text-base">Question</CardTitle>
							<CardDescription>Click to flip</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="whitespace-pre-wrap text-sm leading-relaxed">{card.question}</p>
						</CardContent>
						<CardFooter className="justify-between">
							<p className="text-xs text-muted-foreground">
								{isDue(card.nextReviewAt) ? 'Due now' : `Due: ${formatDate(card.nextReviewAt)}`}
							</p>
							<p className="text-xs text-muted-foreground">Rep: {card.repetitions} · Int: {card.intervalDays}d</p>
						</CardFooter>
					</Card>
				</div>

				<div className="absolute inset-0 backface-hidden transform-[rotateY(180deg)]">
					<Card className="h-full">
						<CardHeader>
							<CardTitle className="text-base">Answer</CardTitle>
							<CardDescription>Click to flip back</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="whitespace-pre-wrap text-sm leading-relaxed">{card.answer}</p>
							{childrenBack}
						</CardContent>
						<CardFooter className="justify-between">
							<p className="text-xs text-muted-foreground">Last: {card.lastRating ?? '—'}</p>
							<p className="text-xs text-muted-foreground">Next: {formatDate(card.nextReviewAt) || '—'}</p>
						</CardFooter>
					</Card>
				</div>
			</div>
		</div>
	)
}

export default function FlashcardsPage() {
	const [flashcards, setFlashcards] = useState<Flashcard[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [pageError, setPageError] = useState<string | null>(null)

	const [title, setTitle] = useState('')
	const [numCards, setNumCards] = useState(12)
	const [documentText, setDocumentText] = useState('')
	const [isGenerating, setIsGenerating] = useState(false)

	const [flipped, setFlipped] = useState<Record<string, boolean>>({})
	const [reviewingId, setReviewingId] = useState<string | null>(null)

	const dueCount = useMemo(() => flashcards.filter((c) => isDue(c.nextReviewAt)).length, [flashcards])

	const canGenerate = useMemo(() => {
		return documentText.trim().length >= 50 && !isGenerating
	}, [documentText, isGenerating])

	async function fetchFlashcards() {
		setPageError(null)
		setIsLoading(true)
		try {
			const res = await api.get('/api/flashcards')
			const cards = (res.data as { flashcards?: Flashcard[] })?.flashcards
			setFlashcards(Array.isArray(cards) ? cards : [])
		} catch (err) {
			setPageError(getErrorMessage(err))
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		fetchFlashcards()
	}, [])

	async function onGenerate() {
		setPageError(null)
		setIsGenerating(true)
		try {
			const payload = {
				documentText: documentText.trim(),
				numCards: clampInt(numCards, { min: 1, max: 50, fallback: 12 }),
				title: title.trim(),
			}
			const res = await api.post('/api/flashcards/generate', payload)
			const created = (res.data as { flashcards?: Flashcard[] })?.flashcards
			if (Array.isArray(created) && created.length) {
				setFlashcards((prev) => [...created, ...prev])
				setFlipped({})
				setDocumentText('')
			}
		} catch (err) {
			setPageError(getErrorMessage(err))
		} finally {
			setIsGenerating(false)
		}
	}

	async function onReview(card: Flashcard, rating: Rating) {
		setPageError(null)
		setReviewingId(card._id)
		try {
			const res = await api.put('/api/flashcards/review', { flashcardId: card._id, rating })
			const updated = (res.data as { flashcard?: Flashcard })?.flashcard
			if (updated?._id) {
				setFlashcards((prev) => prev.map((c) => (c._id === updated._id ? updated : c)))
				setFlipped((prev) => ({ ...prev, [updated._id]: false }))
				invalidateAnalytics('flashcard-review')
			}
		} catch (err) {
			setPageError(getErrorMessage(err))
		} finally {
			setReviewingId(null)
		}
	}

	return (
		<section className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-2xl font-semibold tracking-tight">Flashcards</h2>
				<p className="text-sm text-muted-foreground">
					Generate flashcards with AI, flip to reveal answers, and review with spaced repetition.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Generate flashcards</CardTitle>
					<CardDescription>Paste text from your document (min 50 chars).</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="fc-title">Title (optional)</Label>
							<Input
								id="fc-title"
								placeholder="e.g. JavaScript basics"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fc-count">Cards</Label>
							<Input
								id="fc-count"
								type="number"
								min={1}
								max={50}
								value={numCards}
								onChange={(e) => setNumCards(clampInt(e.target.value, { min: 1, max: 50, fallback: 12 }))}
							/>
							<p className="text-xs text-muted-foreground">1–50 cards.</p>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="fc-text">Document text</Label>
						<Textarea
							id="fc-text"
							rows={8}
							placeholder="Paste your content here…"
							value={documentText}
							onChange={(e) => setDocumentText(e.target.value)}
						/>
					</div>

					{pageError ? <p className="text-sm text-destructive">{pageError}</p> : null}
				</CardContent>
				<CardFooter className="justify-end gap-2">
					<Button
						variant="outline"
						type="button"
						onClick={() => {
							setTitle('')
							setNumCards(12)
							setDocumentText('')
							setPageError(null)
						}}
						disabled={isGenerating}
					>
						Clear
					</Button>
					<Button type="button" onClick={onGenerate} disabled={!canGenerate}>
						{isGenerating ? 'Generating…' : 'Generate'}
					</Button>
				</CardFooter>
			</Card>

			<div className="flex items-center justify-between gap-3">
				<h3 className="text-lg font-semibold">Your flashcards</h3>
				<div className="flex items-center gap-2">
					<p className="text-sm text-muted-foreground">Due: {dueCount}</p>
					<Button variant="outline" type="button" onClick={fetchFlashcards} disabled={isLoading}>
						Refresh
					</Button>
				</div>
			</div>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : flashcards.length === 0 ? (
				<p className="text-sm text-muted-foreground">No flashcards yet. Generate your first set above.</p>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{flashcards.map((card) => (
						<FlashcardFlip
							key={card._id}
							card={card}
							isFlipped={Boolean(flipped[card._id])}
							onToggle={() => setFlipped((prev) => ({ ...prev, [card._id]: !prev[card._id] }))}
							childrenBack={
								<div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
									<Button
										variant="outline"
										type="button"
										onClick={() => onReview(card, 'hard')}
										disabled={reviewingId === card._id}
									>
										Hard
									</Button>
									<Button
										variant="secondary"
										type="button"
										onClick={() => onReview(card, 'medium')}
										disabled={reviewingId === card._id}
									>
										Medium
									</Button>
									<Button
										type="button"
										onClick={() => onReview(card, 'easy')}
										disabled={reviewingId === card._id}
									>
										Easy
									</Button>
								</div>
							}
						/>
					))}
				</div>
			)}
		</section>
	)
}
