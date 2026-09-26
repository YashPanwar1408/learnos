# AI Learning Platform — Backend (Server)

This folder contains the **Node.js + Express** backend.

It provides:

- JWT auth
- PDF upload + text extraction
- AI endpoints (Groq)
- **Token billing** (server-side debit/refund)
- **Razorpay payments** to buy token packs

Entry point: `server.js`

---

## Quick start

```bash
npm install
npm run dev
```

Default dev URL: `http://localhost:5000`

---

## Environment variables (`server/.env`)

Minimum required:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret

# AI (Groq)
GROQ_API_KEY=your_groq_api_key

# Razorpay (server-side secret)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

Optional:

```env
# Groq tuning
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_MS=60000

# Cloudinary (if storing uploads in Cloudinary)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Logs
AI_LOG_PROVIDER=true
```

---

## Token billing (server-side)

Tokens live on the `users` collection:

- `tokens`: remaining balance
- `plan`: `free | pro | premium`
- `totalTokensUsed`: cumulative usage

New accounts default to **50 tokens**.

Charging logic:

- Centralized ledger service: `services/tokenLedger.service.js`
  - `debitTokens()` does an atomic `tokens >= cost` check
  - `creditTokens()` refunds on failure
- Costs are defined in: `utils/tokenCosts.js`
- After a debit/refund, controllers store the new values in `res.locals` and `server.js` appends these to JSON object responses:
  - `tokensRemaining`
  - `plan`
  - `totalTokensUsed`

### Token costs

Fixed costs:

- chat: 2
- summary: 5 (cache miss only)
- explain: 3 (cache miss only)
- studyPlan: 5 (cache miss only)
- knowledgeGraph: 8
- practiceLab: 10
- performanceAnalysis: 5
- courseFromDocument: 20

Variable costs:

- quiz: `3 + ceil((questions − 5) / 5)`
- flashcards: `3 + ceil((cards − 12) / 10)`
- customCourse: `3 + 2 × modules`

### Insufficient tokens

If the user doesn’t have enough tokens, the API returns `402`:

```json
{
  "message": "Insufficient tokens",
  "requiredTokens": 5,
  "currentTokens": 2,
  "action": "summary"
}
```

---

## Payments (Razorpay)

Token packs are defined in `services/razorpay.service.js`.

Routes (all protected by JWT):

- `POST /api/payment/create-order`
  - body: `{ "planType": "starter" | "pro" | "premium" }`
  - returns: `{ orderId, amount, currency, tokensAdded, planType }`

- `POST /api/payment/verify`
  - body: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
  - verifies HMAC on the server and credits tokens

---

## Main route groups

- `/api/auth` — auth
- `/api/payment` — Razorpay token packs
- `/api/documents` — uploads + documents
- `/api/chat` — document chat
- `/api/quiz` — quiz generation + submissions
- `/api/flashcards` — flashcard generation + reviews
- `/api/ai` — summary/explain/study plan/knowledge graph/practice lab/performance analysis

---

## Production notes

- Keep `RAZORPAY_KEY_SECRET`, `JWT_SECRET`, and `GROQ_API_KEY` private.
- Point `MONGO_URI` to MongoDB Atlas in production.
- Configure CORS according to your deployment (client origin).
