import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Trash2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { api } from '@/lib/api'
import { invalidateAnalytics } from '@/lib/analyticsEvents'
import { clearLastOpenedDocumentIfMatches } from '@/lib/lastOpenedDocument'

type DocumentItem = {
	_id: string
	title: string
	fileUrl: string
	createdAt?: string
	flashcardCount?: number
	quizCount?: number
}

function isPdf(file: File) {
	const nameOk = file.name.toLowerCase().endsWith('.pdf')
	const mimeOk = file.type === 'application/pdf'
	return nameOk || mimeOk
}

function stripPdfExtension(name: string) {
	return name.replace(/\.pdf$/i, '')
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Something went wrong'
}

export default function DocumentsPage() {
	const navigate = useNavigate()
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	const [documents, setDocuments] = useState<DocumentItem[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [pageError, setPageError] = useState<string | null>(null)

	const [isDragging, setIsDragging] = useState(false)
	const [file, setFile] = useState<File | null>(null)
	const [title, setTitle] = useState('')
	const [uploadError, setUploadError] = useState<string | null>(null)
	const [isUploading, setIsUploading] = useState(false)
	const [uploadOpen, setUploadOpen] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)

	const canUpload = useMemo(() => Boolean(file && title.trim().length > 0 && !isUploading), [file, title, isUploading])

	async function fetchDocuments() {
		setPageError(null)
		setIsLoading(true)
		try {
			const res = await api.get('/api/documents')
			const docs = (res.data as { documents?: DocumentItem[] })?.documents
			setDocuments(Array.isArray(docs) ? docs : [])
		} catch (err) {
			setPageError(getErrorMessage(err))
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		fetchDocuments()
	}, [])

	function pickFile(nextFile: File | null) {
		setUploadError(null)
		if (!nextFile) {
			setFile(null)
			return
		}
		if (!isPdf(nextFile)) {
			setUploadError('Only PDF files are allowed')
			setFile(null)
			return
		}
		setFile(nextFile)
		if (!title.trim()) {
			setTitle(stripPdfExtension(nextFile.name))
		}
	}

	function clearUploadForm() {
		setIsDragging(false)
		setFile(null)
		setTitle('')
		setUploadError(null)
		if (fileInputRef.current) fileInputRef.current.value = ''
	}

	async function onUpload() {
		if (!file) return
		const trimmedTitle = title.trim()
		if (!trimmedTitle) return

		setUploadError(null)
		setIsUploading(true)
		try {
			const form = new FormData()
			form.append('title', trimmedTitle)
			form.append('file', file)

			await api.post('/api/documents/upload', form, {
				headers: { 'Content-Type': 'multipart/form-data' },
			})
			invalidateAnalytics('document-upload')

			clearUploadForm()
			setUploadOpen(false)
			await fetchDocuments()
		} catch (err) {
			setUploadError(getErrorMessage(err))
		} finally {
			setIsUploading(false)
		}
	}

	async function onDelete(doc: DocumentItem) {
		const ok = window.confirm(`Delete "${doc.title}"?`)
		if (!ok) return
		setDeletingId(doc._id)
		try {
			await api.delete(`/api/documents/${doc._id}`)
			clearLastOpenedDocumentIfMatches(doc._id)
			setDocuments((prev) => prev.filter((d) => d._id !== doc._id))
		} catch (err) {
			setPageError(getErrorMessage(err))
		} finally {
			setDeletingId(null)
		}
	}

	return (
		<section className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight">My Documents</h2>
					<p className="text-sm text-muted-foreground">Manage and organize your learning materials</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" type="button" onClick={fetchDocuments} disabled={isLoading}>
						Refresh
					</Button>
					<Button type="button" onClick={() => setUploadOpen(true)}>
						<Upload className="mr-2 size-4" />
						Upload Document
					</Button>
				</div>
			</div>

			{pageError ? <p className="text-sm text-destructive">{pageError}</p> : null}

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : documents.length === 0 ? (
				<p className="text-sm text-muted-foreground">No documents yet. Upload your first PDF above.</p>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{documents.map((doc) => (
						<Card
							key={doc._id}
							role="button"
							tabIndex={0}
							onClick={() => navigate(`/documents/${doc._id}`)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') navigate(`/documents/${doc._id}`)
							}}
							className="relative bg-white dark:bg-card rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
						>
							<button
								type="button"
								className="absolute right-3 top-3 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									onDelete(doc)
								}}
								aria-label="Delete document"
								disabled={deletingId === doc._id}
							>
								<Trash2 className="size-4" />
							</button>
							<CardHeader className="space-y-3 pr-12">
								<div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
									<FileText className="h-5 w-5" />
								</div>
								<div className="space-y-1">
									<CardTitle className="text-base line-clamp-1">{doc.title}</CardTitle>
									<CardDescription>
										{doc.createdAt ? `Uploaded ${new Date(doc.createdAt).toLocaleString()}` : 'Uploaded'}
									</CardDescription>
								</div>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex flex-wrap gap-2">
									<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
										Flashcards: {doc.flashcardCount ?? 0}
									</span>
									<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
										Quizzes: {doc.quizCount ?? 0}
									</span>
								</div>
								<p className="text-sm text-muted-foreground">Open to chat, summarize, and generate study tools.</p>
							</CardContent>
							<CardFooter className="pt-0">
								<div className="text-xs text-muted-foreground">Click to open workspace</div>
							</CardFooter>
						</Card>
					))}
				</div>
			)}

			<Modal
				open={uploadOpen}
				onOpenChange={(open) => {
					setUploadOpen(open)
					if (!open) clearUploadForm()
				}}
				title="Upload New Document"
				description="Add a PDF document to your library"
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="doc-title">Document Title</Label>
						<Input
							id="doc-title"
							placeholder="e.g. React Hooks Notes"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>

					<div className="space-y-2">
						<Label>PDF File</Label>
						<div
							role="button"
							tabIndex={0}
							className={
								'rounded-xl border border-dashed p-5 transition-colors ' +
								(isDragging ? 'border-ring bg-muted' : 'border-border bg-background')
							}
							onClick={() => fileInputRef.current?.click()}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
							}}
							onDragOver={(e) => {
								e.preventDefault()
								setIsDragging(true)
							}}
							onDragLeave={() => setIsDragging(false)}
							onDrop={(e) => {
								e.preventDefault()
								setIsDragging(false)
								const next = e.dataTransfer.files?.[0] || null
								pickFile(next)
							}}
						>
							<div className="space-y-1 text-center">
								<p className="text-sm font-medium">{file ? file.name : 'Drop PDF here or click to browse'}</p>
								<p className="text-xs text-muted-foreground">PDF up to 10MB</p>
							</div>
						</div>

						<input
							ref={fileInputRef}
							type="file"
							accept="application/pdf,.pdf"
							className="hidden"
							onChange={(e) => pickFile(e.target.files?.[0] || null)}
						/>
					</div>

					{uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

					<div className="flex items-center justify-end gap-2 pt-2">
						<Button
							variant="outline"
							type="button"
							onClick={() => {
								setUploadOpen(false)
								clearUploadForm()
							}}
							disabled={isUploading}
						>
							Cancel
						</Button>
						<Button type="button" onClick={onUpload} disabled={!canUpload}>
							{isUploading ? 'Uploading…' : 'Upload'}
						</Button>
					</div>
				</div>
			</Modal>
		</section>
	)
}
