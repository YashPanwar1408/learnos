import type { LucideIcon } from 'lucide-react'
import { BarChart3, BookOpen, Bot, BrainCircuit, CreditCard, FileText, Flame, LayoutDashboard, Share2, TestTube2, User, Waypoints } from 'lucide-react'

export type NavItem = {
	label: string
	to: string
	icon: LucideIcon
}

export const navItems: readonly NavItem[] = [
	{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
	{ label: 'Learning Missions', to: '/missions', icon: Waypoints },
	{ label: 'Learner Twin', to: '/learner-twin', icon: BrainCircuit },
	{ label: 'Knowledge Map', to: '/knowledge-graph', icon: Share2 },
	{ label: 'Practice', to: '/practice-lab', icon: TestTube2 },
	{ label: 'Review', to: '/review', icon: Flame },
	{ label: 'Courses', to: '/courses', icon: BookOpen },
	{ label: 'Documents', to: '/documents', icon: FileText },
	{ label: 'AI Tutor', to: '/tutor', icon: Bot },
	{ label: 'Teacher Studio', to: '/teacher', icon: User },
	{ label: 'Analytics', to: '/analytics', icon: BarChart3 },
	{ label: 'Settings', to: '/profile', icon: User },
	{ label: 'Pricing', to: '/pricing', icon: CreditCard },
] as const

export function getTitleFromPath(pathname: string): string {
	const match = navItems.find((item) => item.to === pathname)
	if (match) return match.label
	if (pathname.startsWith('/documents/')) return 'Document'
	return 'Dashboard'
}
