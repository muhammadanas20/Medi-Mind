# 💊 MediMind — AI-Powered Offline Medication Management

[![CI](https://github.com/muhammadanas20/Medical-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammadanas20/Medical-AI/actions/workflows/ci.yml)
[![Deploy](https://github.com/muhammadanas20/Medical-AI/actions/workflows/deploy.yml/badge.svg)](https://github.com/muhammadanas20/Medical-AI/actions/workflows/deploy.yml)
![tests](https://img.shields.io/badge/unit%20tests-39%20passing-07c5a8)
![offline](https://img.shields.io/badge/storage-IndexedDB%20%2B%20Dexie-07c5a8)

> **Privacy-first. Local-first. Human-confirmed.**
> MediMind scans prescriptions with AI, but **never lets AI make medical decisions** — every extracted medicine must be reviewed and confirmed by a human before a single reminder exists.

---

## ✨ The core safety loop

```
Patient → 📷 Photo of prescription → OCR + Vision AI → Structured JSON
       → 👤 USER REVIEWS & CONFIRMS  (the non-negotiable gate)
       → Medication schedule → 🗄️ Offline local DB → 🔔 Smart reminder engine
       → Medication tracking & adherence analytics
```

The AI is treated strictly as an **extraction assistant**. Its output is
schema-validated (zod), clamped to sane ranges, and staged in editable cards.
Only the *Confirm* button writes schedules.

## 🚀 Features

| Area | What it does |
|---|---|
| **Prescription scan** | Camera capture → AI vision extraction (patient, doctor, hospital, diagnosis, medicines with M/A/E/N doses, food timing, duration, tests, follow-up) → editable review cards → confirm |
| **Offline fallback** | No AI key? Tesseract OCR runs fully on-device and helps you fill cards manually |
| **Smart reminder engine** | Time windows (Morning 6–10, Afternoon 12–3, Evening 5–8, Night 9–11, all editable); escalation — ignored doses re-notify every N minutes (default 60) until taken or the window closes; **critical meds** get +1h of persistent reminders |
| **Dose actions** | ✅ Taken · ⏰ Snooze (10/30/60 min) · ⏭ Skip · ↩︎ Undo |
| **Pill identifier** | Photo → imprint OCR/AI-vision + color + shape → `matchPills()` scores a local reference DB → results shown as **possible matches with confidence %**, always with a "verify with packaging" warning — never a definitive ID |
| **Dashboard** | Per-slot progress cards, next-dose chip, 7-day adherence graph, streaks, per-med adherence bars, activity timeline |
| **Multi-provider AI** | OpenAI · Gemini · Claude · OpenRouter · Groq · **Ollama** & **LM Studio** (fully local inference). Fetch-based clients, no SDK bloat. **Test connection** button per provider |
| **Security** | API keys AES-256-GCM encrypted in IndexedDB; optional **passcode lock** (PBKDF2 310k iters) re-encrypts keys so they need your passcode in memory |
| **Family mode** | Multiple profiles (elderly, patients, dependents), quick-switcher in the header |
| **Local-first** | Dexie/IndexedDB, PWA with offline caching, JSON export/import backup |

## 🧱 Tech stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Framer Motion · Zustand · TanStack Query · Dexie (IndexedDB) · Tesseract.js · zod · lucide-react · vite-plugin-pwa · Vitest · Playwright

## 🏃 Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # unit tests: reminder engine, AI parser, crypto, pill matcher
npm run test:e2e   # Playwright smoke flow (chromium)
npm run build      # production PWA
```

## 🗂️ Architecture

```
src/
├── lib/
│   ├── types.ts          # domain model (Medication, DoseLog, Prescription, …)
│   ├── db.ts             # Dexie schema + settings store
│   ├── reminders.ts      # PURE reminder engine: windows, escalation, adherence  ← unit-tested
│   ├── scheduler.ts      # runtime ticker: materialize logs → auto-miss → notify
│   ├── notifications.ts  # SW/Notification bridge + chime/haptics
│   ├── crypto.ts         # AES-GCM keys (+ optional passcode lock)
│   ├── pills.ts          # pill reference DB + weighted confidence matcher
│   ├── image.ts          # downscale/contrast/color sampling
│   └── ocr.ts            # lazy Tesseract worker
├── ai/
│   ├── providers.ts      # OpenAI-compat / Gemini / Anthropic fetch clients
│   ├── extract.ts        # prompts + zod schemas + defensive parsing          ← unit-tested
│   └── service.ts        # encrypted-key provider CRUD + extraction use cases
├── state/                # zustand UI store + dexie-react-hooks live queries
├── components/           # ui kit, layout shell, dose cards, camera, charts
└── pages/                # Today · Meds · Scan · Pill ID · Insights · Settings · Onboarding
```

## 🛡️ Design principles

1. **AI never prescribes.** Extraction output is untrusted input until a human confirms it.
2. **Local-first.** No cloud DB, no account, no tracking. JSON backup export included.
3. **Key hygiene.** Keys encrypted at rest (AES-GCM); optional passcode locks them in memory only.
4. **Honest pill ID.** Confidence scores + reasons ("imprint match 'ATV20'", "color matches"), never certainty.
5. **Escalation without cruelty.** Reminders re-fire on a schedule, windows end, missed is recorded — the record is for you and your caregiver, not a guilt machine.

## ⚙️ CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every push & PR | typecheck → 39 unit tests → PWA production build → artifact |
| `deploy.yml` | push to `main` | builds with `VITE_BASE=/Medical-AI/` and deploys the PWA to **GitHub Pages** |
| `dependabot.yml` | weekly | grouped npm + actions dependency PRs |

To enable hosting: **Settings → Pages → Source: GitHub Actions**, then push to `main` —
the app lands at `https://muhammadanas20.github.io/Medical-AI/` fully offline-capable (PWA).

## 🧭 Roadmap (v2)

Family caregiver sync · voice reminders · watch integration · barcode scanning · refill & expiry alerts · drug-interaction warnings · doctor-visit timeline · PDF prescription archive · health reports · adherence analytics export

## ⚕️ Disclaimer

MediMind is an organizational tool. It does not provide medical advice, diagnosis, or treatment.
Always verify medication details with your doctor or pharmacist.

 `Built by Muhammad Anas`
