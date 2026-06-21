'use client';

import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
	({ className, type, ...props }, ref) => {
		const inputRef = React.useRef<HTMLInputElement>(null)
		const cursorRef = React.useRef<HTMLDivElement>(null)

		const animateCursor = React.useCallback(() => {
			const state = physicsRef.current
			if (!cursorRef.current) {
				state.animating = false
				return
			}

			const diff = state.targetX - state.currentX

			// Higher Lerp factor (0.75) for ultra-fast, snappy movement with minimal delay
			state.currentX += diff * 0.45
			state.velocity = diff * 0.45 // Track pseudo-velocity for sleep condition

			// Positional Stretching
			const leftEdge = Math.min(state.currentX, state.targetX)
			const rightEdge = Math.max(state.currentX, state.targetX) + 2 // +2px base width
			const stretch = rightEdge - leftEdge

			cursorRef.current.style.transform = `translate3d(${leftEdge}px, -50%, 0)`
			cursorRef.current.style.width = `${stretch}px`

			const speed = Math.abs(state.velocity)
			// Stop condition
			if (Math.abs(diff) < 0.1 && speed < 0.1) {
				state.currentX = state.targetX
				state.velocity = 0
				cursorRef.current.style.transform = `translate3d(${state.targetX}px, -50%, 0)`
				cursorRef.current.style.width = `2px`
				state.animating = false
				return
			}

			requestAnimationFrame(animateCursor)
		}, [])

		const updateCursorPosition = React.useCallback(() => {
			if (!inputRef.current || !cursorRef.current || !canvasRef.current) return

			const input = inputRef.current
			const start = input.selectionStart || 0
			const end = input.selectionEnd || 0
			const direction = input.selectionDirection

			const caretPos = direction === 'backward' ? start : end
			const textToMeasure = input.value.substring(0, caretPos)

			// Extremely high-performance Canvas measurement (0 layout reflows)
			const ctx = canvasRef.current
			ctx.font = fontCache.current.font
			// Support for modern canvas letterSpacing API (Chrome 99+)
			if ('letterSpacing' in ctx) {
				; (ctx).letterSpacing = fontCache.current.letterSpacing
			}

			const textWidth = ctx.measureText(textToMeasure).width
			const cursorX = fontCache.current.paddingLeft + textWidth - input.scrollLeft

			const state = physicsRef.current
			state.targetX = cursorX

			// First run: snap to avoid zooming in from 0 on first focus
			if (!state.initialized) {
				state.currentX = cursorX
				state.initialized = true
			}

			// Wake up the physics loop if it's sleeping
			if (!state.animating) {
				state.animating = true
				requestAnimationFrame(animateCursor)
			}
		}, [animateCursor])

		const handleSync = () => {
			requestAnimationFrame(updateCursorPosition)
		}

		// Expose ref securely
		React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

		const [isFocused, setIsFocused] = React.useState(false)

		const physicsRef = React.useRef({
			currentX: 0,
			targetX: 0,
			velocity: 0,
			animating: false,
			initialized: false,
		});

		const canvasRef = React.useRef<CanvasRenderingContext2D | null>(null)
		const fontCache = React.useRef({ font: "", paddingLeft: 0, letterSpacing: "" })

		React.useLayoutEffect(() => {
			if (!canvasRef.current) {
				const canvas = document.createElement("canvas")
				canvasRef.current = canvas.getContext("2d")
			}
			if (inputRef.current) {
				const style = window.getComputedStyle(inputRef.current)
				fontCache.current = {
					font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
					paddingLeft: parseFloat(style.paddingLeft) || 0,
					letterSpacing: style.letterSpacing !== 'normal' ? style.letterSpacing : "0px"
				}
			}
			updateCursorPosition()
		}, [className, updateCursorPosition]) // re-measure font if className changes



		// Run sync when external values change
		React.useLayoutEffect(() => {
			updateCursorPosition()
		}, [updateCursorPosition, props.value, props.defaultValue])

		return (
			<div className="relative w-full h-fit flex items-center">
				{/* The Native Input Layer */}
				<input
					ref={inputRef}
					type={type}
					data-slot="input"
					onFocus={(e) => {
						setIsFocused(true)
						handleSync()
						props.onFocus?.(e)
					}}
					onBlur={(e) => {
						setIsFocused(false)
						props.onBlur?.(e)
					}}
					onChange={(e) => {
						handleSync()
						props.onChange?.(e)
					}}
					onSelect={handleSync}
					onKeyUp={handleSync}
					onClick={handleSync}
					onScroll={handleSync}
					className={cn(
						"h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none",
						"file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
						"placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
						"disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
						"aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
						"dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
						"caret-transparent z-10 relative", // Hide native caret
						className
					)}
					{...props}
				/>

				{/* Animated Custom Cursor */}
				<div
					className={cn(
						"absolute top-1/2 left-0 pointer-events-none z-20 transition-opacity duration-150",
						isFocused ? "opacity-100" : "opacity-0"
					)}
				>
					<div
						ref={cursorRef}
						className="h-[1.2em] bg-foreground"
						style={{ transform: 'translate3d(0, -50%, 0)', width: '2px' }}
					/>
				</div>
			</div>
		)
	}
)
Input.displayName = "Input"

export { Input }
