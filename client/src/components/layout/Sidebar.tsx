import { NavLink } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { navItems } from './nav'

export function Sidebar() {
	const { logout } = useAuth()
	const navigate = useNavigate()
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return localStorage.getItem('alp_sidebar_collapsed') === '1'
		} catch {
			return false
		}
	})

	function toggleCollapsed() {
		setCollapsed((prev) => {
			const next = !prev
			try {
				localStorage.setItem('alp_sidebar_collapsed', next ? '1' : '0')
			} catch {
				// ignore
			}
			return next
		})
	}

	function onLogout() {
		logout()
		navigate('/login', { replace: true })
	}

	return (
		<aside
			className={cn(
				'hidden md:sticky md:top-0 md:block md:h-dvh',
				'md:shrink-0 md:transition-[width] md:duration-300 md:ease-out',
				collapsed ? 'md:w-20' : 'md:w-72'
			)}
		>
			<div className="h-full border-base-300 border-b md:border-b-0 md:border-r bg-base-100 text-base-content shadow-sm md:rounded-r-2xl md:flex md:flex-col md:transition-colors">
				<div className={cn('px-4 py-4', collapsed ? 'md:px-3' : '')}>
					<div className={cn('flex items-start justify-between gap-3', collapsed ? 'md:justify-center' : '')}>
						<div
							className={cn(
								'min-w-0 transition-all duration-300 ease-out',
								collapsed ? 'md:pointer-events-none md:opacity-0 md:-translate-x-2 md:w-0' : 'md:opacity-100 md:translate-x-0 md:w-auto'
							)}
						>
							<div className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
								<span className="bg-gradient-to-r from-indigo-600 to-indigo-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-emerald-300">
									LEARNOS
								</span>
							</div>
							<div className="text-xs text-slate-500 dark:text-slate-300">AI learning operating system</div>
						</div>

						<button
							type="button"
							onClick={toggleCollapsed}
							aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
							title={collapsed ? 'Expand' : 'Collapse'}
							className={cn(
								'inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-md active:translate-y-px',
								'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
								collapsed ? 'md:mt-0' : ''
							)}
						>
							<span className="md:hidden" aria-hidden>
								{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
							</span>
							<span className="hidden md:inline" aria-hidden>
								{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
							</span>
						</button>
					</div>
				</div>

				<nav className={cn('px-2 pb-4 md:flex md:flex-1 md:flex-col', collapsed ? 'md:px-2' : '')}>
					<ul className={cn('flex md:flex-col flex-row gap-1 overflow-x-auto md:overflow-visible', collapsed ? 'md:items-center' : '')}>
						{navItems.map((item) => (
							<li key={item.to}>
								<NavLink
									to={item.to}
									end={item.to === '/dashboard'}
									className={({ isActive }) =>
										cn(
											'group inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm outline-none',
											collapsed ? 'md:w-12 md:justify-center md:px-0' : 'md:w-full',
											'transition-all duration-200 ease-out',
											'hover:bg-base-200 hover:shadow-sm hover:-translate-y-px',
											'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100',
											isActive &&
												'bg-linear-to-r from-(--brand-from) to-(--brand-to) text-white shadow-sm hover:shadow-md hover:bg-linear-to-r'
										)
									}
								>
									<item.icon
										className={cn(
											'h-4 w-4 shrink-0 transition-transform duration-200 ease-out',
											'group-hover:translate-x-0.5',
											'opacity-80 group-hover:opacity-100'
										)}
										aria-hidden="true"
									/>
									<span
										className={cn(
											'transition-all duration-300 ease-out',
											collapsed ? 'md:pointer-events-none md:opacity-0 md:w-0 md:overflow-hidden md:-translate-x-1' : 'md:opacity-100 md:translate-x-0'
										)}
									>
										{item.label}
									</span>
								</NavLink>
							</li>
						))}
					</ul>

					<div className="mt-3 border-t border-base-300 pt-3 md:mt-auto">
						<button
							type="button"
							onClick={onLogout}
							className={cn(
								'group inline-flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm outline-none',
								collapsed ? 'md:w-12 md:justify-center md:px-0' : '',
								'transition-all text-red-500 duration-200 ease-out',
								'hover:bg-base-200 hover:shadow-sm hover:-translate-y-px',
								'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100'
							)}
						>
							<LogOut
								className={cn(
									'h-4 w-4 shrink-0 transition-transform duration-200 ease-out',
									'group-hover:translate-x-0.5',
									'opacity-80 group-hover:opacity-100'
								)}
								aria-hidden="true"
							/>
							<span
								className={cn(
									'transition-all duration-300 ease-out',
									collapsed ? 'md:pointer-events-none md:opacity-0 md:w-0 md:overflow-hidden md:-translate-x-1' : 'md:opacity-100 md:translate-x-0'
								)}
							>
								Logout
							</span>
						</button>
					</div>
				</nav>
			</div>
		</aside>
	)
}
