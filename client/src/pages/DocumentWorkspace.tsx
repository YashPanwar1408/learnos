import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { DocumentActions } from '@/components/document/DocumentActions'
import { DocumentChat } from '@/components/document/DocumentChat'
import { DocumentContent } from '@/components/document/DocumentContent'
import { DocumentFlashcards } from '@/components/document/DocumentFlashcards'
import { DocumentQuizzes } from '@/components/document/DocumentQuizzes'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { loadAuthState } from '@/lib/authStorage'
import { saveLastOpenedDocument } from '@/lib/lastOpenedDocument'

type DocumentDetail = {
	_id: string
	title: string
	fileUrl: string
	createdAt?: string
	updatedAt?: string
	flashcardCount?: number
	quizCount?: number
}

type TabKey = 'content' | 'chat' | 'actions' | 'flashcards' | 'quizzes'

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Something went wrong'
}

export default function DocumentWorkspacePage() {
	const params = useParams()
	const documentId = params.id

	const [doc, setDoc] = useState<DocumentDetail | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [pageError, setPageError] = useState<string | null>(null)
	const [tab, setTab] = useState<TabKey>('content')

	const tabItems = useMemo(
		() =>
			[
				{ key: 'content' as const, label: 'Content' },
				{ key: 'chat' as const, label: 'Chat' },
				{ key: 'actions' as const, label: 'AI Actions' },
				{ key: 'flashcards' as const, label: 'Flashcards' },
				{ key: 'quizzes' as const, label: 'Quizzes' },
			],
		[]
	)

	const viewUrl = useMemo(() => {
		const base = String(api.defaults.baseURL || '').replace(/\/+$/, '')
		const token = loadAuthState()?.token
		const url = `${base}/api/documents/${documentId}/view`
		return token ? `${url}?token=${encodeURIComponent(token)}` : url
	}, [documentId])

	useEffect(() => {
		async function run() {
			if (!documentId) return
			setPageError(null)
			setIsLoading(true)
			try {
				const res = await api.get(`/api/documents/${documentId}`)
				const nextDoc = (res.data as { document?: DocumentDetail })?.document
				if (!nextDoc?._id) throw new Error('Document not found')
				setDoc(nextDoc)
				saveLastOpenedDocument({ id: nextDoc._id, title: nextDoc.title })
			} catch (err) {
				setPageError(getErrorMessage(err))
				setDoc(null)
			} finally {
				setIsLoading(false)
			}
		}
		run()
	}, [documentId])

	if (!documentId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Document</CardTitle>
					<CardDescription>Missing document id.</CardDescription>
				</CardHeader>
				<CardContent>
					<Link to="/documents" className={buttonVariants()}>
						Back to documents
					</Link>
				</CardContent>
			</Card>
		)
	}

	return (
		<section className="space-y-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<Link
							to="/documents"
							className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
						>
							Back
						</Link>
					</div>
					<h2 className="mt-3 truncate text-2xl font-semibold tracking-tight">{doc?.title || 'Document workspace'}</h2>
					{doc ? (
						<p className="text-sm text-muted-foreground">
							Flashcards: {doc.flashcardCount ?? 0} {'•'} Quizzes: {doc.quizCount ?? 0}
						</p>
					) : null}
				</div>
				<a
					href={viewUrl}
					target="_blank"
					rel="noreferrer"
					className={cn(buttonVariants({ variant: 'outline' }))}
				>
					Open in new tab
				</a>
			</div>

			<div className="border-b border-border">
				<nav className="flex flex-wrap gap-6">
					{tabItems.map((t) => (
						<button
							key={t.key}
							type="button"
							onClick={() => setTab(t.key)}
							className={
								'-mb-px px-1 pb-3 text-sm font-medium transition-colors ' +
								(tab === t.key
									? 'border-b-2 border-primary text-foreground'
									: 'border-b-2 border-transparent text-muted-foreground hover:text-foreground')
							}
						>
							{t.label}
						</button>
					))}
				</nav>
			</div>

			{pageError ? <p className="text-sm text-destructive">{pageError}</p> : null}

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : !doc ? (
				<Card>
					<CardHeader>
						<CardTitle>Document not found</CardTitle>
						<CardDescription>It may have been deleted or you may not have access.</CardDescription>
					</CardHeader>
					<CardContent>
						<Link to="/documents" className={buttonVariants()}>
							Back to documents
						</Link>
					</CardContent>
				</Card>
			) : (
				<div>
					{tab === 'content' ? <DocumentContent viewUrl={viewUrl} /> : null}
					{tab === 'chat' ? <DocumentChat documentId={doc._id} /> : null}
					{tab === 'actions' ? <DocumentActions documentId={doc._id} /> : null}
					{tab === 'flashcards' ? <DocumentFlashcards documentId={doc._id} documentTitle={doc.title} /> : null}
					{tab === 'quizzes' ? <DocumentQuizzes documentId={doc._id} documentTitle={doc.title} /> : null}
				</div>
			)}
		</section>
	)
}
