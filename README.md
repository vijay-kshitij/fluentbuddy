# FluentBuddy 🐦

**Your AI English practice partner that remembers everything.**

FluentBuddy is an AI-powered English learning app where users practice through real conversations — via text chat or voice calls — with an AI tutor that remembers their life, tracks their progress, and gently corrects mistakes along the way.

## Features

- **Text Chat** — Practice English by typing with your AI tutor
- **Voice Call** — Phone call-style voice conversations with no text on screen — pure speaking practice
- **4 AI Personas** — Buddy (casual friend), Ms. Clarke (strict teacher), Alex (interview coach), Luna (creative storyteller)
- **Persistent Memory** — The AI remembers your job, hobbies, family, and past conversations across sessions
- **Session Analysis** — Get a fluency score, grammar corrections, and personalized tips after each session
- **Progress Dashboard** — Track streak, sessions, practice time, fluency trends, and recent corrections
- **Google Sign-In** — One-tap authentication
- **Voice Input** — Tap to speak in chat mode with speech-to-text

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Database:** Supabase (PostgreSQL + Row Level Security)
- **Auth:** Google OAuth via Supabase Auth
- **AI:** Claude API (proxied through server-side API routes)
- **Voice:** Web Speech API (recognition + synthesis)
- **Deploy:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)
- A [Google Cloud](https://console.cloud.google.com) project with OAuth configured
- An [Anthropic](https://console.anthropic.com) API key

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/fluentbuddy.git
   cd fluentbuddy
   npm install
   ```

2. **Set up Supabase**
   - Create a new Supabase project
   - Run the SQL schema in the SQL Editor (see `docs/schema.sql` or the setup guide)
   - Enable Google Auth in Authentication → Providers

3. **Set up Google OAuth**
   - Create OAuth 2.0 credentials in Google Cloud Console
   - Add redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - Paste Client ID and Secret into Supabase Google provider settings

4. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
   SUPABASE_SERVICE_ROLE_KEY=your-secret-key
   ANTHROPIC_API_KEY=sk-ant-your-key
   ```

5. **Run locally**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

### Deploy to Vercel

1. Push to GitHub
2. Import the repo on [Vercel](https://vercel.com)
3. Add the same environment variables in Vercel's project settings
4. Deploy
5. Update Supabase Auth settings with your Vercel URL

## Project Structure

```
fluentbuddy/
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Root redirect
│   ├── globals.css                 # Global styles
│   ├── login/page.tsx              # Google sign-in
│   ├── auth/callback/route.ts      # OAuth callback
│   ├── dashboard/
│   │   ├── page.tsx                # Server: auth check + data load
│   │   └── DashboardClient.tsx     # Client: full app UI
│   └── api/
│       ├── chat/route.ts           # Claude API proxy
│       ├── analyze/route.ts        # Session analysis
│       └── delete-account/route.ts # Account deletion
├── components/
│   └── AuthProvider.tsx            # Auth context
├── lib/
│   ├── supabase-browser.ts         # Client Supabase
│   ├── supabase-server.ts          # Server Supabase
│   ├── database.ts                 # DB helper functions
│   └── constants.ts                # Personas & levels
└── public/
    └── bird.png                    # App icon
```

## Database Schema

7 tables with Row Level Security:

- **profiles** — User settings (name, level, persona)
- **conversations** — Session metadata (duration, fluency score, persona used)
- **messages** — Chat/call message history
- **memory_notes** — Facts the AI remembers about the user
- **words_learned** — Vocabulary tracker
- **corrections** — Grammar/vocabulary corrections
- **daily_stats** — Aggregated daily metrics for fast dashboard loading

## Security

- Claude API key is **never exposed to the client** — all AI calls go through server-side API routes
- Row Level Security ensures users can only access their own data
- Google OAuth handles authentication — no passwords stored
- Service role key is server-side only

---

Built with Claude by Kshitij Vijayvergiya
