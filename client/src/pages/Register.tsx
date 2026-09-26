import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { PageTransition } from '@/components/motion/PageTransition'

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Registration failed'
}

export default function RegisterPage() {
	const auth = useAuth()
	const navigate = useNavigate()

	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		setIsSubmitting(true)
		try {
			await auth.register(name, email, password)
			navigate('/dashboard', { replace: true })
		} catch (err) {
			setError(getErrorMessage(err))
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<PageTransition motionKey="/register">
			<div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_circle_at_50%_-10%,hsl(var(--primary)/0.18),transparent_50%),radial-gradient(900px_circle_at_20%_100%,hsl(var(--ring)/0.14),transparent_55%)]" />
				<div className="w-full max-w-md">
					<div className="mb-8 text-center">
						<div className="mx-auto mb-3 flex h-12 w-42 items-center justify-center rounded-xl bg-linear-to-r from-(--brand-from) to-(--brand-to) text-primary-foreground shadow-md">
							AI Learning Platform
						</div>
						<h1 className="text-2xl font-semibold text-foreground">Create account</h1>
						<p className="mt-1 text-sm text-muted-foreground">Register to start learning.</p>
					</div>

					<div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
						<form onSubmit={onSubmit} className="space-y-5">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									autoComplete="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
									placeholder="Your name"
									className="h-11"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									placeholder="you@example.com"
									className="h-11"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									autoComplete="new-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									placeholder="Create a password"
									className="h-11"
								/>
							</div>

							{error ? (
								<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{error}
								</div>
							) : null}

							<Button
								type="submit"
								disabled={isSubmitting}
								className="button-primary h-11 w-full rounded-xl font-medium"
							>
								{isSubmitting ? 'Creating…' : 'Create account'}
							</Button>
						</form>

						<div className="my-5 flex items-center gap-3">
							<div className="h-px flex-1 bg-border" />
							<span className="text-xs text-muted-foreground">OR</span>
							<div className="h-px flex-1 bg-border" />
						</div>

						<p className="mt-6 text-center text-sm text-muted-foreground">
							Already have an account?{' '}
							<Link to="/login" className="text-foreground underline underline-offset-4">
								Login
							</Link>
						</p>
					</div>

					<p className="mt-6 text-center text-xs text-muted-foreground">Secure signup • Your data is protected</p>
				</div>
			</div>
		</PageTransition>
	)
}
