import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Bot, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { normalizeMarkdownForDisplay } from '@/lib/markdownMath'

import type { ChatMessage, ChatRole } from './types'

type Props = {
	documentId: string
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Request failed'
}

function bubbleClass(role: ChatRole) {
	return role === 'user'
		? 'bg-linear-to-r from-(--brand-from) to-(--brand-to) text-white'
		: 'bg-white text-foreground border border-border shadow-sm dark:bg-card'
}

function MessageMarkdown({ content, variant }: { content: string; variant: ChatRole }) {
	const isUser = variant === 'user'
	const normalized = useMemo(() => normalizeMarkdownForDisplay(content), [content])
	return (
		<div className="wrap-break-word">
			<ReactMarkdown
				rehypePlugins={[rehypeKatex]}
				remarkPlugins={[remarkGfm, remarkMath]}
				components={{
					p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
					h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>,
					h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold">{children}</h2>,
					h3: ({ children }) => <h3 className="mb-2 text-sm font-medium">{children}</h3>,
					a: ({ children, ...props }) => (
						<a {...props} className={cn('underline underline-offset-4', isUser ? 'text-white' : '')}>
							{children}
						</a>
					),
					ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
					ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
					li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
					hr: () => <hr className={cn('my-3', isUser ? 'border-white/25' : 'border-border')} />,
					blockquote: ({ children }) => (
						<blockquote
							className={cn(
								'my-2 border-l-2 pl-3',
								isUser ? 'border-white/40 text-white/90' : 'border-border text-muted-foreground'
							)}
						>
							{children}
						</blockquote>
					),
					code: ({ children, className, ...props }) => {
						const isBlock = typeof className === 'string' && className.includes('language-')
						if (isBlock) {
							return (
								<code {...props} className="font-mono text-xs">
									{children}
								</code>
							)
						}
						return (
							<code
								{...props}
								className={cn(
									'rounded px-1 py-0.5 font-mono text-xs',
									isUser ? 'bg-white/20 text-white' : 'bg-background'
								)}
							>
								{children}
							</code>
						)
					},
					pre: ({ children }) => (
						<pre
							className={cn(
								'my-2 overflow-x-auto rounded-md border p-3 text-xs',
								isUser ? 'border-white/25 bg-white/10 text-white' : 'border-border bg-background'
							)}
						>
							{children}
						</pre>
					),
					th: ({ children }) => (
						<th
							className={cn(
								'border px-2 py-1 text-left',
								isUser ? 'border-white/25 bg-white/10' : 'border-border bg-background'
							)}
						>
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className={cn('border px-2 py-1 align-top', isUser ? 'border-white/25' : 'border-border')}>
							{children}
						</td>
					),
				}}
			>
				{normalized}
			</ReactMarkdown>
		</div>
	)
}

function AvatarIcon({ role }: { role: ChatRole }) {
	const Icon = role === 'assistant' ? Bot : UserRound
	return (
		<div
			className={cn(
				'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm',
				role === 'assistant'
					? 'bg-muted text-foreground border-border'
					: 'bg-linear-to-br from-(--brand-from) to-(--brand-to) text-white border-white/20'
			)}
		>
			<Icon className="size-4" aria-hidden="true" />
		</div>
	)
}

function TypingDots() {
	return (
		<div className="flex items-center gap-1.5" aria-label="Assistant typing">
			<span className="sr-only">Typing</span>
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className="size-1.5 rounded-full bg-foreground/60 motion-reduce:animate-none animate-bounce"
					style={{ animationDelay: `${i * 120}ms` }}
				/>
			))}
		</div>
	)
}

export function DocumentChat({ documentId }: Props) {
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [input, setInput] = useState('')
	const [isSending, setIsSending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const bottomRef = useRef<HTMLDivElement | null>(null)
	const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending])

	useEffect(() => {
		let cancelled = false
		async function loadHistory() {
			try {
				const res = await api.get(`/api/chat/${documentId}`)
				const next = (res.data as { messages?: ChatMessage[] })?.messages
				if (!cancelled) setMessages(Array.isArray(next) ? next : [])
			} catch {
				// Ignore history fetch errors; chat will still work.
			}
		}
		loadHistory()
		return () => {
			cancelled = true
		}
	}, [documentId])

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
	}, [messages.length, isSending])

	async function sendMessage() {
		const trimmed = input.trim()
		if (!trimmed || isSending) return

		setError(null)
		setIsSending(true)
		setInput('')

		setMessages((prev) => [...prev, { role: 'user', content: trimmed, createdAt: Date.now() }])

		try {
			const res = await api.post('/api/chat', { message: trimmed, documentId })
			const responseText = (res.data as { response?: unknown })?.response
			const assistantText = typeof responseText === 'string' ? responseText : ''
			setMessages((prev) => [...prev, { role: 'assistant', content: assistantText || 'No response returned.', createdAt: Date.now() }])
		} catch (err) {
			const msg = getErrorMessage(err)
			setError(msg)
			setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${msg}`, createdAt: Date.now() }])
		} finally {
			setIsSending(false)
		}
	}

	return (
		<div className="flex min-h-[70vh] flex-col">
			<div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
				<div className="mx-auto w-full max-w-5xl space-y-4">
					{messages.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
							<p className="text-sm font-medium">Start a conversation</p>
							<p className="mt-1 text-xs text-muted-foreground">Ask me anything about this document.</p>
						</div>
					) : null}

					{messages.map((m, idx) => {
						const isUser = m.role === 'user'
						return (
							<div
								key={`${idx}-${String(m.createdAt ?? '')}`}
								className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}
							>
								{!isUser ? <AvatarIcon role="assistant" /> : null}
								<div
									className={cn(
										'w-full max-w-[90ch] rounded-2xl px-4 py-3 text-sm leading-relaxed',
										bubbleClass(m.role)
									)}
								>
									<MessageMarkdown content={m.content} variant={m.role} />
								</div>
								{isUser ? <AvatarIcon role="user" /> : null}
							</div>
						)
					})}

					{isSending ? (
						<div className="flex w-full justify-start gap-3">
							<AvatarIcon role="assistant" />
							<div className={cn('w-full max-w-[90ch] rounded-2xl px-4 py-3', bubbleClass('assistant'))}>
								<TypingDots />
							</div>
						</div>
					) : null}

					<div ref={bottomRef} />
				</div>
			</div>

			<div className="border-t border-border bg-card px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-5xl space-y-2">
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<div className="flex items-end gap-2">
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Ask a follow-up question…"
							rows={2}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault()
									sendMessage()
								}
							}}
							className="min-h-11 resize-none"
							disabled={isSending}
						/>
						<Button type="button" onClick={sendMessage} disabled={!canSend}>
							Send
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">Press Enter to send, Shift+Enter for a new line.</p>
				</div>
			</div>
		</div>
	)
}
