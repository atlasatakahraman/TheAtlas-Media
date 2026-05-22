import { AuthSession, SESSION_KEY, StoredSession, STORAGE_VERSION } from './types'

export function getStoredSession(): AuthSession | null {
	if (typeof window === 'undefined') return null
	try {
		const stored = localStorage.getItem(SESSION_KEY)
		if (!stored) return null

		const data: StoredSession = JSON.parse(stored)
		if (data.version !== STORAGE_VERSION) {
			localStorage.removeItem(SESSION_KEY)
			return null
		}
		const now = Math.floor(Date.now() / 1000)
		if (data.expires_at < now) {
			localStorage.removeItem(SESSION_KEY)
			return null
		}
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { version, stored_at, ...session } = data
		return session
	} catch {
		localStorage.removeItem(SESSION_KEY)
		return null
	}
}

export function setStoredSession(session: AuthSession | null) {
	if (typeof window === 'undefined') return
	try {
		if (session) {
			const storedSession: StoredSession = {
				...session,
				version: STORAGE_VERSION,
				stored_at: Date.now(),
			}
			localStorage.setItem(SESSION_KEY, JSON.stringify(storedSession))
		} else {
			localStorage.removeItem(SESSION_KEY)
		}
	} catch (error) {
		console.error('Failed to store session:', error)
	}
}

export function clearStorage() {
	if (typeof window === 'undefined') return
	try {
		localStorage.removeItem(SESSION_KEY)
	} catch (error) {
		console.error('Failed to clear storage:', error)
	}
}