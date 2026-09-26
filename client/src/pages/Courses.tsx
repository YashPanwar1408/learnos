import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

type CourseListItem = {
	_id: string
	course_title: string
	description?: string | null
	source?: {
		documentId?: string | null
		documentTitle?: string | null
		topic?: string | null
	}
	createdAt?: string
	updatedAt?: string
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Request failed'
}

export default function CoursesPage() {
	const navigate = useNavigate()
	const [courses, setCourses] = useState<CourseListItem[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	async function onDeleteCourse(courseId: string) {
		if (!courseId || deletingId) return
		setError(null)
		setDeletingId(courseId)
		try {
			await api.delete(`/api/courses/${courseId}`)
			await fetchCourses()
		} catch (e) {
			setError(getErrorMessage(e))
		} finally {
			setDeletingId(null)
		}
	}


	const [createOpen, setCreateOpen] = useState(false)
	const [topic, setTopic] = useState('')
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [chapters, setChapters] = useState('')
	const [createError, setCreateError] = useState<string | null>(null)
	const [isCreating, setIsCreating] = useState(false)

	const chaptersCount = useMemo(() => chapters.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).length, [chapters])

	const fetchCourses = useCallback(async () => {
		setError(null)
		setIsLoading(true)
		try {
			const res = await api.get('/api/courses')
			const list = (res.data as { courses?: CourseListItem[] })?.courses
			setCourses(Array.isArray(list) ? list : [])
		} catch (e) {
			setError(getErrorMessage(e))
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchCourses()
	}, [fetchCourses])

	async function onCreateCourse() {
		const t = topic.trim()
		const ttl = title.trim()
		const desc = description.trim()
		if (!t || !ttl || !desc || chaptersCount < 3) return
		setCreateError(null)
		setIsCreating(true)
		try {
			const res = await api.post('/api/ai/custom-course', {
				topic: t,
				title: ttl,
				description: desc,
				chapters,
			})
			const courseId = (res.data as { courseId?: string })?.courseId
			await fetchCourses()
			setCreateOpen(false)
			if (courseId) navigate(`/courses/${courseId}`)
		} catch (e) {
			setCreateError(getErrorMessage(e))
		} finally {
			setIsCreating(false)
		}
	}

	return (
		<section className="space-y-6">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight">Courses</h2>
					<p className="text-sm text-muted-foreground">Generated courses from your documents and topics.</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" type="button" onClick={() => setCreateOpen((v) => !v)}>
						Create notes with AI
					</Button>
					<Button variant="outline" type="button" onClick={fetchCourses} disabled={isLoading}>
						Refresh
					</Button>
				</div>
			</div>

			{error ? <p className="text-sm text-destructive">{error}</p> : null}


			{createOpen ? (
				<Card className="card">
					<CardHeader>
						<CardTitle>Create notes with AI</CardTitle>
						<CardDescription>Create a structured, in-depth course from any topic (not tied to PDFs).</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{createError ? <p className="text-sm text-destructive">{createError}</p> : null}
						<div className="space-y-2">
							<Label htmlFor="topic">Topic</Label>
							<Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Data Structures & Algorithms" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="title">Title</Label>
							<Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mastering DSA from Zero to Interview" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="desc">Description</Label>
							<Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What these notes cover, who it's for, prerequisites…" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="chapters">Chapters (one per line)</Label>
							<Textarea
								id="chapters"
								value={chapters}
								onChange={(e) => setChapters(e.target.value)}
								placeholder="Chapter 1: Foundations\nChapter 2: …\nChapter 3: …"
							/>
							<p className="text-xs text-muted-foreground">{chaptersCount} chapters (min 3)</p>
						</div>
					</CardContent>
					<CardFooter className="justify-end">
						<Button type="button" onClick={onCreateCourse} disabled={isCreating || !topic.trim() || !title.trim() || !description.trim() || chaptersCount < 3}>
							{isCreating ? 'Generating…' : 'Generate notes'}
						</Button>
					</CardFooter>
				</Card>
			) : null}

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : courses.length === 0 ? (
				<p className="text-sm text-muted-foreground">No courses yet. Generate one from a document in AI Actions or create one with AI.</p>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{courses.map((c) => (
						<Card key={c._id} className="card">
							<CardHeader>
								<CardTitle className="line-clamp-1">{c.course_title}</CardTitle>
								<CardDescription>
									{c.source?.documentTitle
										? `From: ${c.source.documentTitle}`
										: c.source?.topic
											? `Topic: ${c.source.topic}`
											: 'Generated course'}
								</CardDescription>
							</CardHeader>
							<CardContent>
								{c.createdAt ? <p className="text-xs text-muted-foreground">Created {new Date(c.createdAt).toLocaleString()}</p> : null}
							</CardContent>
							<CardFooter className="justify-end">
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => onDeleteCourse(c._id)}
										disabled={Boolean(deletingId)}
									>
										{deletingId === c._id ? 'Deleting…' : 'Delete'}
									</Button>
									<Button type="button" onClick={() => navigate(`/courses/${c._id}`)}>
										View
									</Button>
								</div>
							</CardFooter>
						</Card>
					))}
				</div>
			)}
		</section>
	)
}
