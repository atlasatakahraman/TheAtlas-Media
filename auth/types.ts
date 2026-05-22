export interface AuthUser {
	id: string
	email: string
	email_confirmed_at?: string
	phone?: string
	confirmed_at?: string
	created_at: string
	updated_at: string
}

export interface AuthSession {
	access_token: string
	refresh_token: string
	expires_in: number
	expires_at: number
	token_type: string
	user: AuthUser
}

export interface AuthResponse {
	session?: AuthSession
	user?: AuthUser
}

export const PUBLIC_ROUTES = ['/login'] as const

export function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

export const SESSION_KEY = 'atlas_yt_auth_session'
export const STORAGE_VERSION = '1.0'

export interface StoredSession extends AuthSession {
	version: string
	stored_at: number
}