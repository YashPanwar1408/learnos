import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { normalizeMarkdownForDisplay } from '@/lib/markdownMath'

type CourseDetail = {
	_id: string
	course_title: string
	description?: string | null
	modules: {
		module_title: string
		lessons: {
			lesson_title: string
			content: string
			key_points: string[]
			examples?: string[]
			common_mistakes?: string[]
		}[]
	}[]
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

export default function CourseDetailPage() {
	const { id } = useParams()
	const navigate = useNavigate()

	const [course, setCourse] = useState<CourseDetail | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const fetchCourse = useCallback(async () => {
		if (!id) return
		setError(null)
		setIsLoading(true)
		try {
			const res = await api.get(`/api/courses/${id}`)
			const c = (res.data as { course?: CourseDetail })?.course
			if (!c?._id) throw new Error('Course not found')
			setCourse(c)
		} catch (e) {
			setError(getErrorMessage(e))
			setCourse(null)
		} finally {
			setIsLoading(false)
		}
	}, [id])

	useEffect(() => {
		fetchCourse()
	}, [fetchCourse])

	return (
		<section className="space-y-6">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight">{course?.course_title || 'Course'}</h2>
					{course?.source?.documentTitle ? (
						<p className="text-sm text-muted-foreground">From: {course.source.documentTitle}</p>
					) : course?.source?.topic ? (
						<p className="text-sm text-muted-foreground">Topic: {course.source.topic}</p>
					) : null}
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" onClick={() => navigate('/courses')}
					>
						Back
					</Button>
					<Button type="button" variant="outline" onClick={fetchCourse} disabled={isLoading}
					>
						Refresh
					</Button>
				</div>
			</div>

			{error ? <p className="text-sm text-destructive">{error}</p> : null}

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : !course ? (
				<Card className="card">
					<CardHeader>
						<CardTitle>Course not found</CardTitle>
						<CardDescription>Try going back to courses.</CardDescription>
					</CardHeader>
					<CardFooter className="justify-end">
						<Button type="button" onClick={() => navigate('/courses')}>Back to Courses</Button>
					</CardFooter>
				</Card>
			) : (
				<div className="space-y-4">
					{course.description ? <p className="text-sm">{course.description}</p> : null}
					{course.modules.map((m, idx) => (
						<Card key={idx} className="card">
							<CardHeader>
								<CardTitle className="text-base">{m.module_title}</CardTitle>
								<CardDescription>{m.lessons.length} lessons</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2">
								{m.lessons.map((l, lIdx) => (
									<details key={lIdx} className="rounded-md border border-border bg-background px-3 py-2">
										<summary className="cursor-pointer text-sm font-medium select-none">
											{l.lesson_title}
										</summary>
										<div className="mt-3 space-y-3">
											<div className="prose prose-sm max-w-none">
												<ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
													{normalizeMarkdownForDisplay(l.content)}
												</ReactMarkdown>
											</div>
											{l.key_points?.length ? (
												<ul className="list-disc pl-5 text-sm">
													{l.key_points.map((kp, kpIdx) => (
														<li key={kpIdx}>{kp}</li>
													))}
												</ul>
											) : null}
											{l.examples?.length ? (
												<div>
													<p className="text-sm font-medium">Examples</p>
													<ul className="mt-1 list-disc pl-5 text-sm">
														{l.examples.map((ex, exIdx) => (
															<li key={exIdx}>{ex}</li>
														))}
													</ul>
												</div>
											) : null}
											{l.common_mistakes?.length ? (
												<div>
													<p className="text-sm font-medium">Common mistakes</p>
													<ul className="mt-1 list-disc pl-5 text-sm">
														{l.common_mistakes.map((cm, cmIdx) => (
															<li key={cmIdx}>{cm}</li>
														))}
													</ul>
												</div>
											) : null}
										</div>
									</details>
								))}
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</section>
	)
}
