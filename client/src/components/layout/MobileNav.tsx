import { NavLink } from 'react-router-dom'
import { BrainCircuit, Flame, LayoutDashboard, Sparkles, Waypoints } from 'lucide-react'

const items = [{ label: 'Today', to: '/dashboard', icon: LayoutDashboard }, { label: 'Missions', to: '/missions', icon: Waypoints }, { label: 'Twin', to: '/learner-twin', icon: BrainCircuit }, { label: 'Tutor', to: '/tutor', icon: Sparkles }, { label: 'Review', to: '/review', icon: Flame }]

export function MobileNav() {
	return <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-white/10 bg-slate-950/90 p-2 shadow-2xl backdrop-blur md:hidden" aria-label="Mobile navigation">{items.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] ${isActive ? 'bg-cyan-400 text-slate-950' : 'text-slate-400'}`}><Icon size={16} /><span>{label}</span></NavLink>)}</nav>
}