import axios from 'axios'

import { loadAuthState, syncAuthFromServerTokens } from './authStorage'

function getApiBaseUrl() {
	const envUrl = (import.meta.env.VITE_API_URL as string | undefined) || ''
	if (envUrl.trim()) return envUrl.trim().replace(/\/+$/, '')

	// Default behavior:
	// - Dev: assume backend runs on port 5000 of the same hostname.
	// - Prod: assume API is served from same origin.
	if (import.meta.env.DEV) {
		const { protocol, hostname } = window.location
		return `${protocol}//${hostname}:5000`
	}
	return window.location.origin
}

const API_BASE_URL = getApiBaseUrl()

export const api = axios.create({
	baseURL: API_BASE_URL,
	headers: {
		'Content-Type': 'application/json',
	},
})

api.interceptors.request.use((config) => {
	const auth = loadAuthState()
	if (auth?.token) {
		config.headers = config.headers || {}
		config.headers.Authorization = `Bearer ${auth.token}`
	}
	return config
})

api.interceptors.response.use(
	(response) => {
		syncAuthFromServerTokens(response?.data)
		return response
	},
	(error) => {
		syncAuthFromServerTokens(error?.response?.data)
		return Promise.reject(error)
	}
)
