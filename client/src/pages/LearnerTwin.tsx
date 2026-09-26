import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BrainCircuit, CheckCircle2, CircleAlert, Clock3, Gauge, RefreshCw, Send, Sparkles, Target } from 'lucide-react'

import { api } from '@/lib/api'
import { demoTwin } from '@/lib/demoData'

type Mastery = typeof demoTwin.mastery[number]
type TwinData = typeof demoTwin
const demoStorageKey = 'learnos-demo-mode'

function average(items: Mastery[], key: keyof Mastery) {
	return items.length ? Math.round(items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length) : 0
}

function Metric({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Gauge; color: string }) {
	return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className={`mb-5 flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon size={17} /></div><p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>
}

export default function LearnerTwinPage() {
	const [data, setData] = useState<TwinData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [demoMode, setDemoMode] = useState(() => localStorage.getItem(demoStorageKey) === '1')
	const [selectedId, setSelectedId] = useState('subnetting')
	const [submitting, setSubmitting] = useState(false)
	const [result, setResult] = useState<{ calibration: string; confidenceGap: number; diagnostic: { nextAction: string } } | null>(null)
	const [form, setForm] = useState({ conceptName: 'Subnetting', question: 'How many host addresses are in a /26 network?', correctAnswer: '62', studentAnswer: '64', studentExplanation: 'A /26 leaves 6 host bits, so there are 64 hosts.', confidence: '95', isCorrect: 'false' })

	const load = useCallback(async () => {
		setLoading(true); setError(null)
		if (demoMode) { setData(demoTwin); setLoading(false); return }
		try { setData((await api.get<TwinData>('/api/learner-twin')).data) } catch { setError('Learner Twin could not be loaded. Enable Demo mode to explore the experience.'); setData(null) } finally { setLoading(false) }
	}, [demoMode])
	useEffect(() => { load() }, [load])

	const mastery = data?.mastery || []
	const selected = mastery.find((item) => item._id === selectedId) || mastery[0]
	const overall = average(mastery, 'currentScore')
	const retention = Math.max(0, Math.min(100, overall + 9))
	const consistency = Math.max(0, Math.min(100, overall + 13))
	const calibration = selected ? Math.max(0, 100 - Math.abs(selected.confidenceScore - selected.reasoningScore)) : 0

	function toggleDemo() { const next = !demoMode; setDemoMode(next); localStorage.setItem(demoStorageKey, next ? '1' : '0') }
	function resetDemo() { localStorage.setItem(demoStorageKey, '1'); setDemoMode(true); setSelectedId('subnetting'); setResult(null); setForm({ conceptName: 'Subnetting', question: 'How many host addresses are in a /26 network?', correctAnswer: '62', studentAnswer: '64', studentExplanation: 'A /26 leaves 6 host bits, so there are 64 hosts.', confidence: '95', isCorrect: 'false' }); setData(demoTwin) }

	async function submitEvidence(event: React.FormEvent) {
		event.preventDefault(); setSubmitting(true); setResult(null)
		if (demoMode) { window.setTimeout(() => { setData((current) => current ? { ...current, mastery: current.mastery.map((item) => item._id === 'subnetting' ? { ...item, currentScore: 68, scoreDelta: 27, confidenceScore: 78, reasoningScore: 84 } : item), misconceptions: [] } : null); setResult({ confidenceGap: 17, calibration: 'Previous misconception resolved', diagnostic: { nextAction: 'Review this concept again in 5 days.' } }); setSubmitting(false) }, 350); return }
		try { const response = await api.post('/api/learning/attempt', { ...form, confidence: Number(form.confidence), isCorrect: form.isCorrect === 'true' }); setResult(response.data); await load() } catch (requestError) { const message = (requestError as { response?: { data?: { message?: unknown } } }).response?.data?.message; setError(typeof message === 'string' ? message : 'Evidence could not be recorded.') } finally { setSubmitting(false) }
	}

	const graphNodes = useMemo(() => [
		{ id: 'subnetting', label: 'Subnetting', x: '50%', y: '12%', status: 'learning' },
		{ id: 'network-bits', label: 'Network vs host bits', x: '18%', y: '48%', status: 'weak' },
		{ id: 'cidr', label: 'CIDR notation', x: '50%', y: '70%', status: 'learning' },
		{ id: 'tcp-reliability', label: 'TCP reliability', x: '82%', y: '48%', status: 'mastered' },
	], [])

	if (loading) return <section className="space-y-6"><div className="h-32 animate-pulse rounded-3xl bg-white/[0.06]" /><div className="grid gap-4 md:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white/[0.05]" />)}</div></section>
	if (!data) return <section className="rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center text-slate-200"><CircleAlert className="mx-auto mb-3 text-red-300" /><p>{error}</p><button onClick={load} className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"><RefreshCw size={15} /> Retry</button></section>

	return <section className="space-y-6">
		<header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-cyan-300">LEARNOS / LEARNER TWIN</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Your learning state, made visible.</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">The Twin tracks evidence across attempts, explanations, confidence, and review. It does not guess mastery from consumption.</p></div><div className="flex gap-2"><button onClick={toggleDemo} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.09]">{demoMode ? 'Exit demo mode' : 'Try demo mode'}</button>{demoMode ? <button onClick={resetDemo} className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-300/20">Reset Demo</button> : null}</div></header>
		{demoMode ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-sm text-cyan-100"><span className="font-semibold">Demo Student · Computer Networks.</span> This sandbox uses isolated sample evidence and never writes to your learner profile.</div> : null}
		<div className="grid gap-4 md:grid-cols-5"><Metric label="Overall mastery" value={`${overall}%`} icon={BrainCircuit} color="bg-cyan-400/15 text-cyan-300" /><Metric label="Retention" value={`${retention}%`} icon={Clock3} color="bg-violet-400/15 text-violet-300" /><Metric label="Calibration" value={`${calibration}%`} icon={Gauge} color="bg-amber-400/15 text-amber-300" /><Metric label="Reasoning" value={`${average(mastery, 'reasoningScore')}%`} icon={Target} color="bg-emerald-400/15 text-emerald-300" /><Metric label="Consistency" value={`${consistency}%`} icon={CheckCircle2} color="bg-blue-400/15 text-blue-300" /></div>
		<div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Knowledge map</p><h2 className="mt-2 text-xl font-semibold text-white">Computer Networks</h2></div><div className="flex flex-wrap justify-end gap-2 text-[11px] text-slate-400"><span><i className="mr-1 inline-block size-2 rounded-full bg-emerald-300" />Mastered</span><span><i className="mr-1 inline-block size-2 rounded-full bg-cyan-300" />Learning</span><span><i className="mr-1 inline-block size-2 rounded-full bg-amber-300" />Weak</span></div></div><div className="relative mt-6 h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40"><svg className="absolute inset-0 h-full w-full" aria-hidden><line x1="50%" y1="20%" x2="18%" y2="54%" stroke="rgba(103,232,249,.25)" /><line x1="50%" y1="20%" x2="50%" y2="76%" stroke="rgba(103,232,249,.25)" /><line x1="50%" y1="20%" x2="82%" y2="54%" stroke="rgba(103,232,249,.25)" /></svg>{graphNodes.map((node) => <button key={node.id} onClick={() => setSelectedId(node.id)} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-2 text-left text-xs transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${selected?._id === node.id ? 'border-white bg-white/15 text-white' : 'border-white/10 bg-slate-900/90 text-slate-300'}`} style={{ left: node.x, top: node.y }}><span className={`mr-2 inline-block size-2 rounded-full ${node.status === 'mastered' ? 'bg-emerald-300' : node.status === 'weak' ? 'bg-amber-300' : 'bg-cyan-300'}`} />{node.label}</button>)}</div><p className="mt-3 text-xs text-slate-500">Select a concept to inspect the evidence behind its score.</p></div>
			<div className="space-y-6"><div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.05] p-6"><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Selected concept</p><h2 className="mt-2 text-xl font-semibold text-white">{selected?.conceptId?.name || 'No concept evidence yet'}</h2><p className="mt-1 text-sm text-slate-400">Mastery {selected?.currentScore || 0}% · delta {selected?.scoreDelta || 0}%</p><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between text-slate-300"><span>Reasoning quality</span><span>{selected?.reasoningScore || 0}%</span></div><div className="flex justify-between text-slate-300"><span>Confidence</span><span>{selected?.confidenceScore || 0}%</span></div><div className="flex justify-between text-slate-300"><span>Review schedule</span><span className="text-cyan-300">Due today</span></div></div><button className="mt-5 inline-flex items-center gap-2 text-sm text-cyan-300">Open evidence <ArrowUpRight size={14} /></button></div><div className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.05] p-6"><div className="flex items-center gap-2 text-amber-200"><Sparkles size={17} /><h2 className="font-semibold">What LEARNOS sees</h2></div><p className="mt-3 text-sm leading-6 text-slate-300">{data.misconceptions[0]?.description || 'Your reasoning is becoming more consistent. Keep retrieving before adding new material.'}</p></div></div></div>
		<div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.04] p-6"><div className="mb-5 flex items-center gap-3"><Send size={17} className="text-cyan-300" /><div><h2 className="text-xl font-semibold text-white">Prove that you learned it</h2><p className="text-sm text-slate-400">Correct is a signal. Your explanation is the evidence.</p></div></div><form onSubmit={submitEvidence} className="grid gap-4 md:grid-cols-2"><input required value={form.conceptName} onChange={(e) => setForm({ ...form, conceptName: e.target.value })} placeholder="Concept" className="field" /><input required value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Question" className="field" /><input required value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })} placeholder="Verified correct answer" className="field" /><input required value={form.studentAnswer} onChange={(e) => setForm({ ...form, studentAnswer: e.target.value })} placeholder="Your answer" className="field" /><textarea required value={form.studentExplanation} onChange={(e) => setForm({ ...form, studentExplanation: e.target.value })} placeholder="Explain it in your own words" className="field min-h-24 md:col-span-2" /><div className="flex flex-wrap gap-3 md:col-span-2"><select value={form.isCorrect} onChange={(e) => setForm({ ...form, isCorrect: e.target.value })} className="field w-auto"><option value="false">Answer was incorrect</option><option value="true">Answer was correct</option></select><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-300">Confidence <input type="number" min="0" max="100" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} className="w-14 bg-transparent text-white outline-none" /></label><button disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{submitting ? 'Evaluating...' : 'Evaluate evidence'}</button></div></form>{result ? <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4"><p className="font-semibold text-emerald-200">Confidence gap: {result.confidenceGap}%</p><p className="mt-1 text-sm text-slate-300">{result.calibration}</p><p className="mt-2 text-sm text-slate-200">Next action: {result.diagnostic.nextAction}</p></div> : null}</div>
	</section>
}