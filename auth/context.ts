import { createContext } from "react"
import { AuthSession, AuthUser } from "./types"

export interface AuthContextType {
	user: AuthUser | null
	session: AuthSession | null
	loading: boolean
	error: string | null
	isAuthenticated: boolean
	signInWithGoogle: () => Promise<void>
	signOut: () => Promise<void>
	refreshSession: () => Promise<void>
	clearError: () => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)