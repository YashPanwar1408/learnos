# AI Learning Platform — Frontend (Client)

This folder contains the **React + TypeScript** frontend for the AI Learning Platform.

The client:

- talks to the backend REST API (`/api/*`)
- opens **Razorpay Checkout** for token purchases
- shows and auto-updates the user’s **token balance** while using AI features

---

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- Axios
- Recharts (charts)
- Framer Motion (transitions)
- KaTeX + Markdown (math + markdown rendering)
- lucide-react (icons)

---

## Getting started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Create `client/.env`:

```env
# Backend base URL (optional)
VITE_API_URL=http://localhost:5000

# Razorpay public key (safe to expose)
VITE_RAZORPAY_KEY_ID=rzp_test_...
```

If `VITE_API_URL` is not set, the app will:

- in dev: assume backend runs on port `5000` on the same hostname
- in prod: use same-origin (`window.location.origin`)

### 3) Run dev server

```bash
npm run dev
```

---

## Token balance UI (auto-sync)

The backend appends `tokensRemaining` (and optionally `plan`, `totalTokensUsed`) to JSON **object** responses when a request debited/refunded tokens.

The client keeps the Navbar token badge in sync by:

- reading `tokensRemaining` from responses in an Axios **response interceptor** (`src/lib/api.ts`)
- updating local auth state + broadcasting an auth update event (`src/lib/authStorage.ts`)
- listening to that event inside `AuthProvider` (`src/context/AuthContext.tsx`)

This means the UI updates immediately after:

- chat messages
- summary/explain/study-plan
- quiz generation
- flashcard generation
- knowledge graph / practice lab / performance analysis

---

## Payments (Razorpay)

The Pricing page:

1. calls `POST /api/payment/create-order` (backend creates a Razorpay order)
2. opens Razorpay Checkout using `VITE_RAZORPAY_KEY_ID`
3. on success, calls `POST /api/payment/verify` so the backend can verify the HMAC signature and credit tokens

---

## Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview production build
- `npm run lint` — lint

---

## Troubleshooting

### “Missing VITE_RAZORPAY_KEY_ID”

Set `VITE_RAZORPAY_KEY_ID` in `client/.env` and restart the dev server.

### Requests going to the wrong backend

- confirm backend is running on port `5000`
- set `VITE_API_URL` explicitly
