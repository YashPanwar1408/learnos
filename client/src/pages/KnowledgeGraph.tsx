import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

type DocumentListItem = {
	_id: string
	title?: string
}

type KnowledgeGraphResponse = {
	nodes: Array<{ id: string }>
	edges: Array<{ source: string; target: string; label: string }>
}

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Request failed'
}

function getRetryAfterSeconds(error: unknown): number | null {
	const anyErr = error as { response?: { data?: { retryAfterSeconds?: unknown } } }
	const raw = anyErr?.response?.data?.retryAfterSeconds
	const n = typeof raw === 'string' ? Number(raw) : (raw as number)
	if (!Number.isFinite(n) || n <= 0) return null
	return Math.max(1, Math.trunc(n))
}

function useCooldownLabel(untilMs: number | null) {
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (!untilMs) return
		const t = window.setInterval(() => {
			const nextNow = Date.now()
			setNow(nextNow)
			if (nextNow >= untilMs) {
				window.clearInterval(t)
			}
		}, 250)
		return () => window.clearInterval(t)
	}, [untilMs])

	const remaining = untilMs ? Math.max(0, Math.ceil((untilMs - now) / 1000)) : 0
	return { remainingSeconds: remaining, isCoolingDown: remaining > 0 }
}

function toSafeId(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '')
		.slice(0, 64) || 'node'
}

function buildLayout(nodeIds: string[]) {
	// Simple deterministic grid layout (no extra deps).
	const count = nodeIds.length
	const cols = Math.max(3, Math.ceil(Math.sqrt(count)))
	const spacingX = 220
	const spacingY = 120
	return nodeIds.map((label, index) => {
		const row = Math.floor(index / cols)
		const col = index % cols
		return {
			id: toSafeId(label) + '-' + index,
			label,
			position: { x: col * spacingX, y: row * spacingY },
		}
	})
}

export default function KnowledgeGraphPage() {
	const [docs, setDocs] = useState<DocumentListItem[]>([])
	const [selectedId, setSelectedId] = useState<string>('')
	const [graph, setGraph] = useState<KnowledgeGraphResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)

	const cooldown = useCooldownLabel(cooldownUntil)
	const fetchDocs = useCallback(async () => {
		try {
			const res = await api.get('/api/documents')
			const items = (res.data as { documents?: DocumentListItem[] })?.documents
			const next = Array.isArray(items) ? items : []
			setDocs(next)
			setSelectedId((cur) => cur || (next?.[0]?._id ?? ''))
		} catch (e) {
			setError(getErrorMessage(e))
		}
	}, [])

	useEffect(() => {
		fetchDocs()
	}, [fetchDocs])

	async function onGenerate() {
		if (!selectedId || isLoading || cooldown.isCoolingDown) return
		setError(null)
		setIsLoading(true)
		try {
			const res = await api.post(
				'/api/ai/knowledge-graph',
				{ documentId: selectedId },
				{ timeout: 65000 }
			)
			const data = res.data as Partial<KnowledgeGraphResponse>
			if (
				!data ||
				!Array.isArray(data.nodes) ||
				!data.nodes.every((n) => n && typeof (n as { id?: unknown }).id === 'string' && String((n as { id?: unknown }).id).trim()) ||
				!Array.isArray(data.edges)
			) {
				throw new Error('Invalid knowledge graph returned')
			}
			setGraph({ nodes: data.nodes as KnowledgeGraphResponse['nodes'], edges: data.edges as KnowledgeGraphResponse['edges'] })
		} catch (e) {
			const anyErr = e as { code?: unknown }
			if (anyErr?.code === 'ECONNABORTED') {
				setError('Knowledge graph generation timed out. Please try again.')
				setGraph(null)
				return
			}
			const retry = getRetryAfterSeconds(e)
			if (retry) setCooldownUntil(Date.now() + retry * 1000)
			setError(getErrorMessage(e))
			setGraph(null)
		} finally {
			setIsLoading(false)
		}
	}

	const rfNodes = useMemo((): Node[] => {
		if (!graph) return []
		const layout = buildLayout(graph.nodes.map((n) => n.id))
		return layout.map((n) => ({
			id: n.id,
			position: n.position,
			data: { label: n.label },
			type: 'default',
		}))
	}, [graph])

	const rfEdges = useMemo((): Edge[] => {
		if (!graph) return []
		// Map concept label -> node id (first occurrence)
		const layout = buildLayout(graph.nodes.map((n) => n.id))
		const idByLabel = new Map<string, string>()
		for (const n of layout) {
			if (!idByLabel.has(n.label)) idByLabel.set(n.label, n.id)
		}
		return (graph.edges || [])
			.map((e, index) => {
				const source = idByLabel.get(e.source)
				const target = idByLabel.get(e.target)
				if (!source || !target) return null
				return {
					id: `e-${index}`,
					source,
					target,
					label: e.label,
					animated: false,
				}
			})
			.filter(Boolean) as Edge[]
	}, [graph])

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Knowledge Graph</CardTitle>
					<CardDescription>Visual connections of concepts from your document.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{error ? <p className="text-sm text-destructive">{error}</p> : null}

					<div className="space-y-2">
						<Label htmlFor="doc">Document</Label>
						<select
							id="doc"
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
							value={selectedId}
							onChange={(e) => setSelectedId(e.target.value)}
						>
							{docs.map((d) => (
								<option key={d._id} value={d._id}>
									{d.title || 'Untitled'}
								</option>
							))}
						</select>
					</div>
				</CardContent>
				<CardFooter className="justify-end">
					<Button type="button" onClick={onGenerate} disabled={!selectedId || isLoading || cooldown.isCoolingDown}>
						{isLoading ? 'Generating…' : cooldown.isCoolingDown ? `Try again in ${cooldown.remainingSeconds}s` : 'Generate graph'}
					</Button>
				</CardFooter>
			</Card>

			{graph ? (
				<Card>
					<CardHeader>
						<CardTitle>Graph</CardTitle>
						<CardDescription>{graph.nodes.length} nodes • {graph.edges.length} edges</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="h-[70vh] w-full overflow-hidden rounded-lg border border-border">
							<ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
								<Background />
								<Controls />
							</ReactFlow>
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	)
}
