import { Outlet, useLocation } from 'react-router-dom'

import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { PageTransition } from '@/components/motion/PageTransition'
import { MobileNav } from './MobileNav'

export function AppLayout() {
	const location = useLocation()

	return (
		<div className="min-h-dvh bg-[#070b16] text-base-content">
			<div className="flex flex-col md:flex-row min-h-dvh">
				<Sidebar />
				<div className="flex min-w-0 flex-1 flex-col">
					<Navbar />
					<main className="flex-1 p-4 pb-28 md:p-6 md:pb-6">
						<div className="mx-auto w-full max-w-7xl">
							<PageTransition motionKey={location.pathname}>
								<Outlet />
							</PageTransition>
						</div>
						<MobileNav />
					</main>
				</div>
			</div>
		</div>
	)
}
