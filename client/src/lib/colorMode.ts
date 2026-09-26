export type ColorMode = 'light' | 'dark'

const STORAGE_KEY = 'alp_color_mode'

function safeGetStorageItem(key: string): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

function safeSetStorageItem(key: string, value: string) {
	try {
		localStorage.setItem(key, value)
	} catch {
		// ignore
	}
}

export function getStoredColorMode(): ColorMode | null {
	const raw = safeGetStorageItem(STORAGE_KEY)
	if (raw === 'light' || raw === 'dark') return raw
	return null
}

export function getSystemPreferredColorMode(): ColorMode {
	if (typeof window === 'undefined') return 'light'
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyColorMode(mode: ColorMode) {
	const root = document.documentElement
	if (mode === 'dark') root.classList.add('dark')
	else root.classList.remove('dark')
}

export function setColorMode(mode: ColorMode) {
	applyColorMode(mode)
	safeSetStorageItem(STORAGE_KEY, mode)
}

export function initColorMode(defaultMode: ColorMode = 'light') {
	const stored = getStoredColorMode()
	const mode = stored ?? getSystemPreferredColorMode() ?? defaultMode
	applyColorMode(mode)
}
