import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { AUTH_STATE_EVENT, clearAuthState, loadAuthState, saveAuthState } from '@/lib/authStorage'
import type { AuthState, AuthUser } from '@/lib/authStorage'

type AuthContextValue = {
	user: AuthUser | null
	token: string | null
	isAuthenticated: boolean
	login: (email: string, password: string) => Promise<void>
	register: (name: string, email: string, password: string) => Promise<void>
	setUser: (user: AuthUser) => void
	logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function normalizeAuthResponse(data: unknown): AuthState {
	const obj = data as { token?: unknown; user?: unknown }
	if (!obj?.token || typeof obj.token !== 'string') {
		throw new Error('Invalid auth response')
	}
	const user = obj.user as Partial<AuthUser>
	if (!user || typeof user !== 'object') throw new Error('Invalid auth response')
	if (typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string') {
		throw new Error('Invalid auth response')
	}
	const tokens = Number.isFinite(user.tokens) ? (user.tokens as number) : 50
	const planRaw = typeof user.plan === 'string' ? user.plan : 'free'
	const plan = planRaw === 'pro' || planRaw === 'premium' || planRaw === 'free' ? planRaw : 'free'
	const totalTokensUsed = Number.isFinite(user.totalTokensUsed) ? (user.totalTokensUsed as number) : 0
	const role = user.role === 'teacher' ? 'teacher' : 'student'
	return {
		token: obj.token,
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			tokens,
			plan,
			totalTokensUsed,
			role,
		},
	}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const initial = typeof window !== 'undefined' ? loadAuthState() : null
	const [auth, setAuth] = useState<AuthState | null>(initial)

	useEffect(() => {
		if (typeof window === 'undefined') return
		const handler = (event: Event) => {
			const next = (event as CustomEvent<AuthState | null>).detail
			setAuth(next ?? null)
		}
		window.addEventListener(AUTH_STATE_EVENT, handler)
		return () => window.removeEventListener(AUTH_STATE_EVENT, handler)
	}, [])

	const value = useMemo<AuthContextValue>(() => {
		return {
			user: auth?.user ?? null,
			token: auth?.token ?? null,
			isAuthenticated: Boolean(auth?.token),
			async login(email: string, password: string) {
				const res = await api.post('/api/auth/login', { email, password })
				const next = normalizeAuthResponse(res.data)
				saveAuthState(next)
				setAuth(next)
			},
			async register(name: string, email: string, password: string) {
				const res = await api.post('/api/auth/register', { name, email, password })
				const next = normalizeAuthResponse(res.data)
				saveAuthState(next)
				setAuth(next)
			},
			setUser(user: AuthUser) {
				if (!auth?.token) return
				const next = { token: auth.token, user }
				saveAuthState(next)
				setAuth(next)
			},
			logout() {
				clearAuthState()
				setAuth(null)
			},
		}
	}, [auth])

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within AuthProvider')
	return ctx
}
