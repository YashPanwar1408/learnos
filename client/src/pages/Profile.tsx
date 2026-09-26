import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User as UserIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'

export default function ProfilePage() {
	const { user, logout } = useAuth()
	const navigate = useNavigate()

	const initials = useMemo(() => {
		const name = (user?.name || '').trim()
		if (!name) return 'U'
		const parts = name.split(/\s+/g).filter(Boolean)
		const first = parts[0]?.[0] || 'U'
		const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : '') || ''
		return (first + last).toUpperCase()
	}, [user?.name])

	function onLogout() {
		logout()
		navigate('/login', { replace: true })
	}

	return (
		<section className="space-y-6">
			<div className="space-y-1">
				<h2 className="section-title">Profile</h2>
				<p className="text-sm text-muted-foreground">Manage your account and session.</p>
			</div>

			<Card className="card">
				<CardHeader className="flex flex-row items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle>Your account</CardTitle>
						<CardDescription>Signed in details</CardDescription>
					</div>
					<div className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-foreground">
						<span className="text-sm font-semibold" aria-hidden>
							{initials}
						</span>
						<UserIcon className="sr-only" />
					</div>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Name</span>
						<span className="font-medium">{user?.name || '—'}</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Email</span>
						<span className="font-medium">{user?.email || '—'}</span>
					</div>
				</CardContent>
				<CardFooter className="justify-end">
					<Button type="button" variant="outline" onClick={onLogout}>
						<LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
						Logout
					</Button>
				</CardFooter>
			</Card>
		</section>
	)
}
