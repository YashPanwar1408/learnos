import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import * as React from 'react'

type PageTransitionProps = {
	children: React.ReactNode
	className?: string
	motionKey?: string
}

export function PageTransition({ children, className, motionKey }: PageTransitionProps) {
	const reduceMotion = useReducedMotion()

	if (reduceMotion) {
		return <div className={className}>{children}</div>
	}

	return (
		<AnimatePresence mode="wait" initial={false}>
			<motion.div
				key={motionKey}
				className={className}
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -8 }}
				transition={{ duration: 0.18, ease: 'easeOut' }}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	)
}
