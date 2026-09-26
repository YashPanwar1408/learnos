import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { loadRazorpayScript } from '@/lib/razorpay'
import type { AuthUser } from '@/lib/authStorage'

type PlanId = 'starter' | 'pro' | 'premium'

type CreateOrderResponse = {
	orderId: string
	amount: number
	currency: string
	planType: PlanId
	tokensAdded: number
}

type VerifyResponse = {
	message?: string
	user?: AuthUser
	addedTokens?: number
}

type RazorpaySuccessResponse = {
	razorpay_order_id?: string
	razorpay_payment_id?: string
	razorpay_signature?: string
}

type RazorpayCheckoutOptions = {
	key: string
	amount: number
	currency: string
	name: string
	description: string
	order_id: string
	prefill?: { name?: string; email?: string }
	handler: (response: RazorpaySuccessResponse) => void | Promise<void>
	modal?: { ondismiss?: () => void }
}

type RazorpayInstance = {
	open: () => void
	on: (event: string, cb: (data: unknown) => void) => void
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance

function getErrorMessage(error: unknown): string {
	const anyErr = error as { response?: { data?: { message?: unknown } } }
	const apiMsg = anyErr?.response?.data?.message
	if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg
	if (error instanceof Error) return error.message
	return 'Request failed'
}

export default function PricingPage() {
	const auth = useAuth()
	const [isPaying, setIsPaying] = useState<PlanId | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState<string | null>(null)

	const plans = useMemo(
		() =>
			[
				{ id: 'starter' as const, name: 'Starter', priceRupees: 99, tokens: 100, description: 'Perfect for getting started.' },
				{ id: 'pro' as const, name: 'Pro', priceRupees: 499, tokens: 700, description: 'Best value for regular learning.' },
				{ id: 'premium' as const, name: 'Premium', priceRupees: 999, tokens: 2000, description: 'For power users and heavy usage.' },
			],
		[]
	)

	async function onBuy(planId: PlanId) {
		setError(null)
		setSuccess(null)

		const keyId = (import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined) || ''
		if (!keyId.trim()) {
			setError('Missing VITE_RAZORPAY_KEY_ID in frontend environment')
			return
		}

		setIsPaying(planId)
		try {
			const scriptOk = await loadRazorpayScript()
			if (!scriptOk) {
				throw new Error('Failed to load Razorpay checkout script')
			}

			const res = await api.post<CreateOrderResponse>('/api/payment/create-order', { planType: planId })
			const order = res.data
			if (!order?.orderId) throw new Error('Invalid create-order response')

			const RazorpayCtor = (window as unknown as { Razorpay?: unknown }).Razorpay as RazorpayConstructor | undefined
			if (!RazorpayCtor) throw new Error('Razorpay is unavailable')

			const rzp = new RazorpayCtor({
				key: keyId.trim(),
				amount: order.amount,
				currency: order.currency,
				name: 'AI Learning Platform',
				description: `${planId.toUpperCase()} token pack`,
				order_id: order.orderId,
				prefill: {
					name: auth.user?.name || '',
					email: auth.user?.email || '',
				},
				handler: async (response: RazorpaySuccessResponse) => {
					try {
						const orderId = typeof response?.razorpay_order_id === 'string' ? response.razorpay_order_id : ''
						const paymentId = typeof response?.razorpay_payment_id === 'string' ? response.razorpay_payment_id : ''
						const signature = typeof response?.razorpay_signature === 'string' ? response.razorpay_signature : ''
						if (!orderId || !paymentId || !signature) {
							throw new Error('Invalid Razorpay success response')
						}

						const verifyRes = await api.post<VerifyResponse>('/api/payment/verify', {
							razorpay_order_id: orderId,
							razorpay_payment_id: paymentId,
							razorpay_signature: signature,
						})

						if (verifyRes.data.user) {
							auth.setUser(verifyRes.data.user)
						}

						const added = Number(verifyRes.data.addedTokens)
						setSuccess(Number.isFinite(added) && added > 0 ? `Payment successful. Added ${added} tokens.` : 'Payment successful.')
					} catch (e) {
						setError(getErrorMessage(e))
					} finally {
						setIsPaying(null)
					}
				},
				modal: {
					ondismiss: () => setIsPaying(null),
				},
			})

			rzp.on('payment.failed', () => {
				setError('Payment failed. Please try again.')
				setIsPaying(null)
			})

			rzp.open()
		} catch (e) {
			setError(getErrorMessage(e))
			setIsPaying(null)
		}
	}

	return (
		<section className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold text-base-content">Buy tokens</h2>
				<p className="text-sm text-base-content/70">AI features consume tokens. Purchase more anytime.</p>
				{auth.user ? (
					<p className="text-sm text-base-content/70">
						Current balance: <span className="font-semibold tabular-nums text-base-content">{auth.user.tokens}</span>
					</p>
				) : null}
			</div>

			{error ? (
				<div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
			) : null}
			{success ? (
				<div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">{success}</div>
			) : null}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{plans.map((p) => (
					<Card key={p.id} className="rounded-2xl">
						<CardHeader>
							<CardTitle>{p.name}</CardTitle>
							<CardDescription>{p.description}</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className="text-3xl font-semibold tabular-nums">₹{p.priceRupees}</div>
							<div className="text-sm text-muted-foreground">{p.tokens} tokens</div>
						</CardContent>
						<CardFooter>
							<Button
								className="w-full"
								disabled={isPaying !== null}
								onClick={() => onBuy(p.id)}
							>
								{isPaying === p.id ? 'Opening…' : 'Buy'}
							</Button>
						</CardFooter>
					</Card>
				))}
			</div>
		</section>
	)
}
