import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import * as React from 'react'

import { cn } from '@/lib/utils'

export type ModalProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	title?: string
	description?: string
	children: React.ReactNode
	className?: string
}

function useEscapeKey(handler: () => void, enabled: boolean) {
	React.useEffect(() => {
		if (!enabled) return
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') handler()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [enabled, handler])
}

export function Modal({ open, onOpenChange, title, description, children, className }: ModalProps) {
	const reduceMotion = useReducedMotion()
	const panelRef = React.useRef<HTMLDivElement | null>(null)

	const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

	useEscapeKey(close, open)

	React.useEffect(() => {
		if (!open) return
		// Focus the panel for basic accessibility without adding a full focus trap.
		panelRef.current?.focus()
	}, [open])

	const overlayMotion = reduceMotion
		? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
		: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }

	const panelMotion = reduceMotion
		? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
		: {
				initial: { opacity: 0, scale: 0.98, y: 6 },
				animate: { opacity: 1, scale: 1, y: 0 },
				exit: { opacity: 0, scale: 0.98, y: 6 },
			}

	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					key="modal-overlay"
					className="fixed inset-0 z-50 flex items-center justify-center p-4"
					role="dialog"
					aria-modal="true"
					{...overlayMotion}
					transition={{ duration: 0.18, ease: 'easeOut' }}
				>
					<button
						type="button"
						aria-label="Close modal"
						className="absolute inset-0 bg-slate-900/40 backdrop-blur-md dark:bg-black/60"
						onClick={close}
					/>
					<motion.div
						ref={panelRef}
						tabIndex={-1}
						key="modal-panel"
						{...panelMotion}
						transition={{ duration: 0.18, ease: 'easeOut' }}
						className={cn(
							'relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 text-slate-900 shadow-xl ring-1 ring-slate-200 outline-none dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700',
							className
						)}
					>
						<button
							type="button"
							onClick={close}
							aria-label="Close"
							className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-md active:translate-y-px dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
						>
							<span aria-hidden="true" className="text-xl leading-none">
								×
							</span>
						</button>
						{title ? (
							<div className="space-y-1 pb-4">
								<h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
								{description ? <p className="text-sm text-slate-500 dark:text-slate-300">{description}</p> : null}
							</div>
						) : null}
						<div className={cn(title ? 'space-y-4' : '')}>{children}</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	)
}
