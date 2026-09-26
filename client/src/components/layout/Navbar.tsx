import { useLocation } from 'react-router-dom'

import { getTitleFromPath } from './nav'
import { ColorModeToggle } from './ColorModeToggle'
import { useAuth } from '@/context/AuthContext'

export function Navbar() {
	const location = useLocation()
	const title = getTitleFromPath(location.pathname)
	const { user } = useAuth()

	return (
		<header className="sticky top-0 z-20 border-b border-base-300/60 bg-base-100/70 backdrop-blur supports-backdrop-filter:bg-base-100/60">
			<div className="flex h-14 items-center justify-between px-4 md:px-6">
				<div className="min-w-0">
					<h1 className="truncate text-base font-semibold leading-none text-base-content">{title}</h1>
				</div>
				<div className="flex items-center gap-2">
					{user ? (
						<div className="inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-medium text-base-content shadow-sm">
							<span className="opacity-70">Tokens</span>
							<span className="tabular-nums font-semibold">{user.tokens}</span>
						</div>
					) : null}
					<ColorModeToggle />
				</div>
			</div>
		</header>
	)
}
