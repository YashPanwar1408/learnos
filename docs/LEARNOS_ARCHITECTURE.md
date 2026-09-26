# LEARNOS Architecture

## Current architecture

LEARNOS is currently a MERN application with a Vite + React 19 + TypeScript client and an Express 5 + Node.js server. MongoDB is accessed through Mongoose. The client uses React Router, Tailwind CSS v4, shadcn-style primitives, lucide-react, Recharts, React Flow, and Framer Motion. Authentication is JWT-based and stored in browser storage; the API is protected by `server/middleware/auth.middleware.js`.

The server is organized into route, controller, model, and service layers. Existing domains include authentication, documents and PDF extraction, AI actions, chat, quizzes and attempts, flashcards with spaced repetition, courses, progress, activity, analytics, and Razorpay token billing. AI calls are centralized in `server/services/ai.service.js` and token accounting is server-side.

## Features to preserve

- JWT registration/login, token ledger, Razorpay plans, and user profile.
- PDF upload, Cloudinary storage, text extraction, document ownership checks, and document workspace.
- Document chat, summaries, explanations, practice lab, quizzes, flashcards, courses, and knowledge graph.
- Quiz attempts, topic progress, adaptive difficulty, flashcard scheduling, recent activity, and analytics.
- Existing loading/error/retry behavior in document and analytics workflows.

## Proposed LEARNOS architecture

The product layer is organized around a persistent Learner Twin and the loop `DIAGNOSE -> DECIDE -> TEACH -> PRACTICE -> VERIFY -> REMEMBER`.

The first read model is `/api/learner/today`. It aggregates existing user progress, analytics, due flashcards, activity, and the last opened document into one dashboard contract. This avoids duplicating source-of-truth data while giving the UI a stable operating-system surface.

Future writes should emit typed learning events for document progress, lesson completion, quiz submission, practice completion, and flashcard review. A profile document can later hold goals, preferred difficulty, daily target, and explicit learning preferences. Derived metrics such as retention, confidence calibration, and streak should be computed from those events rather than hard-coded in the client.

## Existing features and new product surfaces

The document workspace remains the core teaching and practice surface. The shell now presents Dashboard, Learning Missions, Learner Twin, Knowledge Map, Practice, Review, Courses, Documents, AI Tutor, Analytics, and Settings. Existing routes remain available through these labels and can be deepened incrementally.

New product surfaces:

- Today dashboard: current mission, recommended next action, mastery signals, weak concepts, activity, reviews, and AI insight.
- Learner Twin: current topic strengths and the evidence behind them.
- Learning Missions: a future queue of goal-oriented interventions built on the same read model.
- Review: a dedicated home for due flashcards and spaced repetition.

## Database changes

No migration is required for the first slice. Existing `UserProgress`, `Analytics`, `Flashcard`, `Activity`, and `Document` collections provide the initial Learner Twin signals.

Planned additions:

- `LearnerProfile`: user goals, target topics, daily study target, preferences, and computed streak metadata.
- `LearningEvent`: immutable event type, concept/topic, source, outcome, confidence, duration, and timestamp.
- Optional `ConceptMastery`: normalized concept-level mastery and retention snapshots once quiz/document concepts are consistently tagged.

## API changes

Added in this phase:

- `GET /api/learner/today`: authenticated dashboard read model with identity, mission, recommendation, intelligence metrics, weak/strong concepts, recent activity, upcoming reviews, and insight.

Existing APIs remain unchanged. Future APIs should include learner profile preferences, mission lifecycle, event ingestion, and concept map queries.

## AI architecture

AI provider calls remain behind the existing service abstraction with server-side token charging, cache awareness, validation, timeout handling, and refunds on failed generation. The next step is to make AI interventions consume Learner Twin context and return structured actions: diagnosis, explanation, practice set, verification result, and retention schedule. Prompts must receive only the minimum owned document and learner context needed for the action.

## Roadmap

1. Establish the LEARNOS shell and dashboard read model from existing data.
2. Add durable learning events and document/course progress tracking.
3. Add LearnerProfile goals and mission generation from weak concepts and due reviews.
4. Connect practice and quiz outcomes to concept-level mastery, misconceptions, and confidence calibration.
5. Add a knowledge map backed by normalized concepts and intervention history.
6. Harden production concerns: restricted CORS, secure cookie auth, short-lived document viewer tokens, upload content validation, rate limits, and privacy-safe AI logging.