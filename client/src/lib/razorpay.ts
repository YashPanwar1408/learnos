let razorpayScriptPromise: Promise<boolean> | null = null

export function loadRazorpayScript(): Promise<boolean> {
	if (typeof window === 'undefined') return Promise.resolve(false)
	if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve(true)
	if (razorpayScriptPromise) return razorpayScriptPromise

	razorpayScriptPromise = new Promise((resolve) => {
		const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="1"]')
		if (existing) {
			existing.addEventListener('load', () => resolve(true))
			existing.addEventListener('error', () => resolve(false))
			return
		}

		const script = document.createElement('script')
		script.src = 'https://checkout.razorpay.com/v1/checkout.js'
		script.async = true
		script.defer = true
		script.dataset.razorpayCheckout = '1'
		script.onload = () => resolve(true)
		script.onerror = () => resolve(false)
		document.body.appendChild(script)
	})

	return razorpayScriptPromise
}
