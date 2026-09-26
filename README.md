# LEARNOS

## AI Learning Operating System

> Don't just measure what students consumed. Measure what they actually learned.

LEARNOS is a persistent learning system that continuously:

```text
DIAGNOSE -> DECIDE -> TEACH -> PRACTICE -> VERIFY -> REMEMBER
                         ^                         |
                         |---- Learner Twin <-----|
```

It is designed to understand why a learner is struggling, choose an appropriate intervention, verify whether understanding changed, and schedule the next useful retrieval.

## Why LEARNOS

Traditional AI study tools mostly measure activity: documents opened, summaries generated, or quizzes completed. LEARNOS models evidence about the learner instead:

- concept mastery
- reasoning quality
- confidence calibration
- retention and review need
- misconceptions
- intervention history
- mission progress
- learning events

Numeric mastery is calculated by deterministic server-side logic. AI can diagnose reasoning and recommend pedagogy, but it cannot arbitrarily assign mastery scores.

## Product

### Student experience

- Public LEARNOS landing page
- Today dashboard with next action and current mission
- Learner Twin with mastery metrics and interactive knowledge map
- Learning Missions with adaptive phases
- AI Tutor with learner context and intervention modes
- Prove That I Learned It explanation verification
- Practice Lab
- Review Center with evidence-based review reasons
- PDF documents and document workspace
- AI notes, explanations, chat, quizzes, flashcards, and courses
- Knowledge graph
- Analytics and AI performance insights
- English, Hindi, and Hinglish tutor context
- Voice input, speech output, and image attachment fallbacks

### Teacher experience

Teacher Studio is protected by the `teacher` role and exposes aggregate-only data:

- class overview
- concept mastery heatmap
- struggling and on-track counts
- common misconceptions
- recommended class intervention

Individual learner records are not returned by the teacher aggregate endpoint.

## Competition Demo

1. Open `/learner-twin`.
2. Select `Try demo mode`.
3. Confirm the starting state:
   - Demo Student
   - Computer Networks
   - Subnetting
   - Mastery: 41%
   - Confidence: 95%
   - Misconception: network bits vs host bits
4. Submit the incorrect reasoning in `Prove that you learned it`.
5. Show the confidence gap and misconception evidence.
6. Open `/missions` to show the reason and adaptive timeline.
7. Open `/tutor` to demonstrate Socratic teaching.
8. Return to the Twin, submit the verified explanation, and show:
   - mastery updated to 68%
   - reasoning quality improved
   - confidence gap reduced
   - misconception resolved
   - next review action scheduled
9. Open `/teacher` to show aggregate class intelligence.
10. Press `Reset Demo` before the next run.

The demo mode is local and isolated. It does not write demo data to MongoDB. The complete script is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Routes

### Public

| Route | Purpose |
| --- | --- |
| `/` | LEARNOS product landing page |
| `/login` | Student or teacher login |
| `/register` | Student registration |

### Authenticated

| Route | Purpose |
| --- | --- |
| `/dashboard` | Current mission, recommendation, activity, and reviews |
| `/learner-twin` | Learner state, concept map, evidence, and proof flow |
| `/missions` | Adaptive learning mission timeline |
| `/tutor` | Context-first AI Tutor |
| `/review` | Due and upcoming retrieval review |
| `/practice-lab` | AI-generated practice |
| `/quiz` | Quiz generation and attempts |
| `/flashcards` | Flashcards and spaced repetition |
| `/knowledge-graph` | Document knowledge graph |
| `/documents` | PDF library |
| `/documents/:id` | Document learning workspace |
| `/courses` | Course library and builder |
| `/courses/:id` | Course detail |
| `/analytics` | Quiz analytics and performance insights |
| `/teacher` | Aggregate teacher intelligence |
| `/profile` | Account settings |
| `/pricing` | Token plans and Razorpay billing |

## API

All routes below require JWT authentication unless noted otherwise.

### Core learning intelligence

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/learning/diagnose` | Validate an educational diagnostic response |
| `POST` | `/api/learning/attempt` | Persist attempt, update mastery, resolve misconceptions, schedule review, advance mission |
| `GET` | `/api/learning/mastery` | Load the authenticated learner's concept mastery |
| `POST` | `/api/learning/intervention` | Select and persist a context-sensitive intervention |
| `POST` | `/api/learning/mission` | Create a mission for a concept |
| `GET` | `/api/learning/mission` | List the authenticated learner's missions |
| `POST` | `/api/learning/mission/:id/advance` | Advance a user-owned mission from evidence |
| `GET` | `/api/learning/review` | Load due review schedules |
| `GET` | `/api/learner-twin` | Load the complete Learner Twin |
| `GET` | `/api/learner-twin/insights` | Load confidence calibration insights |

### Teacher intelligence

| Method | Endpoint | Authorization | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/teacher/overview` | `teacher` role | Aggregate class mastery and misconceptions |

### Existing learning APIs

- `/api/auth`
- `/api/documents`
- `/api/chat`
- `/api/quiz`
- `/api/flashcards`
- `/api/courses`
- `/api/ai`
- `/api/progress`
- `/api/analytics`
- `/api/activity`
- `/api/payment`

## Architecture

```text
client/
  React 19 + TypeScript + Vite
  React Router
  Tailwind CSS v4
  Recharts / React Flow
  Axios API client

server/
  Express 5
  Mongoose
  JWT authentication
  AI provider services
  Token ledger and Razorpay billing
  PDF extraction and Cloudinary storage
```

Detailed architecture decisions are documented in [docs/LEARNOS_ARCHITECTURE.md](docs/LEARNOS_ARCHITECTURE.md).

## AI Architecture

AI provider calls are centralized in `server/services/ai.service.js`. Existing provider calls support timeouts, status handling, and token accounting. Learner Twin diagnosis is isolated in `server/services/structuredAi.service.js`:

1. Build a bounded diagnostic prompt from the question, answer, explanation, confidence, and concept context.
2. Request JSON-only output.
3. Extract a complete JSON object safely.
4. Validate required fields and numeric ranges.
5. Retry once when the provider fails or returns malformed output.
6. Use a deterministic educational fallback if both attempts fail.

The mastery engine in `server/services/mastery.core.js` combines correctness, reasoning, retrieval, calibration, difficulty, hints, and retries. The result is clamped to `0..100` and updated with a deterministic moving average.

The pedagogy engine chooses among explanation, Socratic question, analogy, worked example, prerequisite, targeted practice, challenge, retrieval, counterexample, and transfer interventions.

## Database Architecture

Existing product collections include users, documents, quizzes, quiz attempts, flashcards, courses, analytics, progress, activity, payments, and token records.

Learner Twin collections:

- `UserLearningProfile`
- `Concept`
- `ConceptMastery`
- `LearningAttempt`
- `Misconception`
- `Intervention`
- `LearningMission`
- `ReviewSchedule`
- `ConfidenceRecord`
- `LearningEvent`

User-specific collections use `userId` indexes. Concept, mission, and review records use additional indexes for ownership and retrieval. Teacher queries aggregate across learners and do not return private attempt records.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- React Router
- Lucide React
- Recharts
- React Flow
- Express 5
- Node.js
- MongoDB
- Mongoose
- JWT
- Groq AI provider abstraction
- `pdf-parse`
- Cloudinary
- Razorpay

## Prerequisites

- Node.js LTS
- npm
- MongoDB local instance or MongoDB Atlas
- Groq API key for live AI features
- Cloudinary credentials for hosted PDF storage
- Razorpay credentials for payments

## Installation

```powershell
cd client
npm install

cd ..\server
npm install
```

## Environment Variables

Template files are included at [server/.env.example](server/.env.example) and [client/.env.example](client/.env.example). Copy the relevant template to `.env`, then replace every `replace-with-...` value with your own credentials. Real `.env` files are ignored by Git and must never be committed.

```powershell
Copy-Item server\.env.example server\.env
Copy-Item client\.env.example client\.env
```

### Backend: `server/.env`

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/learnos
JWT_SECRET=replace-with-a-long-random-secret
NODE_ENV=development

GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_MS=60000

# Required for production browser origins. Use localhost during development.
CORS_ORIGINS=https://app.example.com

# Optional PDF storage.
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Optional Razorpay billing.
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

In development, an empty `CORS_ORIGINS` allows local browser requests. In production, an explicit allowlist is required.

### Frontend: `client/.env`

```env
# Optional. Defaults to http://<current-host>:5000 in development.
VITE_API_URL=http://localhost:5000

# Public Razorpay key only. Never put a secret here.
VITE_RAZORPAY_KEY_ID=rzp_test_...
```

## Running Locally

Start MongoDB first, then use two terminals:

```powershell
# Terminal 1
cd server
npm run dev

# Terminal 2
cd client
npm run dev
```

Open `http://localhost:5173`.

For a production bundle:

```powershell
cd client
npm run build
npm run preview
```

## Teacher Provisioning

Registration creates student accounts by design. After creating a teacher account, provision it through a protected administrative MongoDB workflow, for example:

```javascript
db.users.updateOne(
  { email: "teacher@example.com" },
  { $set: { role: "teacher" } }
)
```

Do not expose this database operation to untrusted clients.

## Token Billing

AI-heavy actions use server-side token debits. New accounts receive 50 tokens.

| Action | Cost |
| --- | ---: |
| Chat message | 2 |
| Summary or notes cache miss | 5 |
| Explain concept cache miss | 3 |
| Study plan cache miss | 5 |
| Knowledge graph | 8 |
| Practice Lab | 10 |
| Performance analysis | 5 |
| Course from document | 20 |
| Quiz generation | 3 + variable question cost |
| Flashcard generation | 3 + variable card cost |

Token debits are atomic. Failed or invalid AI generation is refunded where supported. Insufficient balance returns HTTP `402`.

## Payments

1. Client calls `POST /api/payment/create-order`.
2. Server creates and stores the Razorpay order.
3. Razorpay Checkout runs in the browser.
4. Client calls `POST /api/payment/verify`.
5. Server verifies the signature and credits tokens/upgrades the plan.

## Testing

```powershell
cd client
npm run lint
npm run build

cd ..\server
npm test
```

The server tests cover:

- mastery bounds and signal weighting
- confidence gaps
- malformed diagnostic JSON
- diagnostic fallback
- mission transitions
- review scheduling
- adaptive pedagogy
- authenticated user ownership contracts
- teacher route authorization

## Security Notes

- Never commit `.env` files or API credentials.
- Configure `CORS_ORIGINS` in production.
- All Learner Twin routes require JWT authentication.
- Teacher overview requires `role: teacher`.
- User-specific queries include the authenticated user ID.
- AI output is validated before learner state is updated.
- Tutor markdown is rendered through the existing controlled React Markdown pipeline.

For hardened production deployment, migrate browser JWT storage to secure HttpOnly cookies and replace document viewer query-string tokens with short-lived authenticated viewer tokens.

## Deployment

1. Provision MongoDB Atlas.
2. Provision the backend with `MONGO_URI`, `JWT_SECRET`, `GROQ_API_KEY`, and `CORS_ORIGINS`.
3. Configure Cloudinary if PDF hosting is required.
4. Configure Razorpay only when billing is enabled.
5. Build the client with the production `VITE_API_URL`.
6. Serve the client preview/build through the chosen static host.
7. Run the server with `npm start`.
8. Verify `/api/health`, authentication, CORS, Learner Twin, and teacher authorization before exposing the app.

## Known Limitations

- Full image understanding requires a configured multimodal vision provider.
- Browser speech recognition and speech synthesis depend on browser support; the Tutor explains unavailable capability without breaking.
- Teacher accounts require administrative provisioning.
- Intervention and misconception-resolution analytics are persisted but not yet fully visualized in the Analytics page.
- Server integration tests require a live MongoDB and configured dependencies.
- The production client bundle is large because PDF, React Flow, Recharts, and KaTeX are currently bundled together.

## Project Documentation

- [Architecture](docs/LEARNOS_ARCHITECTURE.md)
- [Final QA Report](docs/FINAL_QA_REPORT.md)
- [Competition Demo Script](docs/DEMO_SCRIPT.md)