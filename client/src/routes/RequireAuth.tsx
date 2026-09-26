import type React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/context/AuthContext'

export function RequireAuth({ children }: { children: React.ReactElement }) {
	const auth = useAuth()
	const location = useLocation()

	if (!auth.isAuthenticated) {
		return <Navigate to="/login" replace state={{ from: location }} />
	}

	return children
}
