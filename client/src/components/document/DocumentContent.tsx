import { ExternalLink } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
	viewUrl: string
	className?: string
}

export function DocumentContent({ viewUrl, className }: Props) {
	return (
		<Card className={cn(className)}>
			<CardHeader className="flex flex-row items-center justify-between gap-3">
				<CardTitle className="text-base">Document Viewer</CardTitle>
				<a
					href={viewUrl}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
				>
					<ExternalLink className="size-4" />
					Open in new tab
				</a>
			</CardHeader>
			<CardContent>
				<div className="overflow-hidden rounded-xl border border-border bg-background">
					<iframe
						src={viewUrl}
						title="Document PDF"
						className="h-[70vh] w-full"
						loading="lazy"
					/>
				</div>
			</CardContent>
		</Card>
	)
}
