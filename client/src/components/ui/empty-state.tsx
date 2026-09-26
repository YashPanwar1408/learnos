import * as React from 'react'

import { cn } from '@/lib/utils'

type EmptyStateProps = {
	title: string
	description?: string
	action?: React.ReactNode
	className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
	return (
		<div
			data-slot="empty-state"
			className={cn('flex flex-col items-start gap-2 rounded-lg border bg-muted/30 p-4', className)}
		>
			<div className="space-y-1">
				<p className="text-sm font-medium leading-none">{title}</p>
				{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
			</div>
			{action ? <div className="pt-2">{action}</div> : null}
		</div>
	)
}
