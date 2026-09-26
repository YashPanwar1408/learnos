import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { getStoredColorMode, setColorMode, type ColorMode } from '@/lib/colorMode'

function getInitialMode(): ColorMode {
	if (typeof document === 'undefined') return 'light'
	const hasDark = document.documentElement.classList.contains('dark')
	const stored = getStoredColorMode()
	return stored ?? (hasDark ? 'dark' : 'light')
}

export function ColorModeToggle() {
	const [mode, setModeState] = useState<ColorMode>(getInitialMode)

	function toggle() {
		const next: ColorMode = mode === 'dark' ? 'light' : 'dark'
		setModeState(next)
		setColorMode(next)
	}

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
			className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-md active:translate-y-px dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
		>
			{mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
		</button>
	)
}
