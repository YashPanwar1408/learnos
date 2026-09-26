export type AuthUser = {
	id: string
	name: string
	email: string
	tokens: number
	plan: 'free' | 'pro' | 'premium'
	totalTokensUsed: number
	role?: 'student' | 'teacher'
}

export type AuthState = {
	token: string
	user: AuthUser
}

const STORAGE_KEY = 'alp_auth'
export const AUTH_STATE_EVENT = 'alp_auth_state'

function isBrowser() {
	return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function dispatchAuthState(state: AuthState | null) {
	if (!isBrowser()) return
	window.dispatchEvent(new CustomEvent<AuthState | null>(AUTH_STATE_EVENT, { detail: state }))
}

export function loadAuthState(): AuthState | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<AuthState>
		if (!parsed?.token || !parsed?.user) return null
		if (typeof parsed.token !== 'string') return null
		if (
			typeof parsed.user !== 'object' ||
			!parsed.user ||
			typeof (parsed.user as AuthUser).id !== 'string' ||
			typeof (parsed.user as AuthUser).email !== 'string' ||
			typeof (parsed.user as AuthUser).name !== 'string'
		)
			return null
		const u = parsed.user as Partial<AuthUser>
		const tokens = Number.isFinite(u.tokens) ? (u.tokens as number) : 50
		const planRaw = typeof u.plan === 'string' ? u.plan : 'free'
		const plan = planRaw === 'pro' || planRaw === 'premium' || planRaw === 'free' ? planRaw : 'free'
		const totalTokensUsed = Number.isFinite(u.totalTokensUsed) ? (u.totalTokensUsed as number) : 0
		return {
			token: parsed.token,
			user: {
				id: (u.id as string) || '',
				name: (u.name as string) || '',
				email: (u.email as string) || '',
				tokens,
				plan,
				totalTokensUsed,
				role: u.role === 'teacher' ? 'teacher' : 'student',
			},
		}
	} catch {
		return null
	}
}

export function saveAuthState(state: AuthState): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
	dispatchAuthState(state)
}

export function clearAuthState(): void {
	localStorage.removeItem(STORAGE_KEY)
	dispatchAuthState(null)
}

export function syncAuthFromServerTokens(payload: unknown): AuthState | null {
	if (!isBrowser()) return null
	const current = loadAuthState()
	if (!current) return null
	if (!payload || typeof payload !== 'object') return null

	const obj = payload as Record<string, unknown>
	const tokensRemainingRaw = Number(obj.tokensRemaining)
	const currentTokensRaw = Number(obj.currentTokens)
	const tokens = Number.isFinite(tokensRemainingRaw)
		? tokensRemainingRaw
		: Number.isFinite(currentTokensRaw)
			? currentTokensRaw
			: null

	const planRaw = typeof obj.plan === 'string' ? obj.plan : null
	const plan = planRaw === 'pro' || planRaw === 'premium' || planRaw === 'free' ? planRaw : null
	const totalTokensUsedRaw = Number(obj.totalTokensUsed)
	const totalTokensUsed = Number.isFinite(totalTokensUsedRaw) ? totalTokensUsedRaw : null

	if (tokens === null && plan === null && totalTokensUsed === null) return null

	const next: AuthState = {
		...current,
		user: {
			...current.user,
			...(tokens === null ? {} : { tokens }),
			...(plan === null ? {} : { plan }),
			...(totalTokensUsed === null ? {} : { totalTokensUsed }),
		},
	}
	saveAuthState(next)
	return next
}
