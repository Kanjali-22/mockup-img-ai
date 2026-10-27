# AI Product Mockup & Advertising Studio

A professional, production-ready web application for generating high-end commercial product mockups, studio lighting scenes, and advertising visuals using **Stability AI** (Stable Image Core & Ultra) and **OpenAI** (DALL·E 2 & 3) APIs.

![Mockup Studio AI](https://img.shields.io/badge/Status-Production%20Ready-emerald)
![Stability AI](https://img.shields.io/badge/AI%20Providers-Stability%20AI%20%7C%20OpenAI-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![React](https://img.shields.io/badge/React-18.3-cyan)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8)
![Vite](https://img.shields.io/badge/Vite-5.3-646CFF)
![Express](https://img.shields.io/badge/Express-4.19-000000)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933)

---

## 🌟 Features

- **Drag-and-Drop Image Uploader**: Real-time client-side preview, file validation (PNG, JPEG, WebP up to 10MB), and instant clear/replace.
- **Scene Preset Library**: 9 pre-engineered photographic presets with custom lighting prompts (Luxury Studio, Minimal White, Nature & Botanical, Marble & Premium, Futuristic Display, Festive, Outdoor Lifestyle, E-commerce Catalog, Cinematic Dark).
- **Prompt Formula & Enhancer**: Built-in 5-part formula for high-converting mockups + negative prompt controls.
- **Aspect Ratio Selector**: 6 standard advertising ratios:
  - `1:1` Square (Instagram Post)
  - `3:4` Portrait (Product Shot)
  - `4:3` Landscape (Blog / Web)
  - `9:16` Story / Reel (Instagram & TikTok)
  - `16:9` Widescreen (YouTube / Banner)
  - `21:9` Ultra-wide (Hero Banner)
- **Multi-Provider Model Selection**: Switch between **Stability AI** (Stable Image Core, Stable Image Ultra) and **OpenAI** (DALL·E 2, DALL·E 3) with adjustable Image Strength slider (`0.10` to `1.00`), seed control, and output format (`png`, `jpeg`, `webp`).
- **Real-Time Side-by-Side Comparison**: Interactive Before / After slider to compare the original uploaded product against the AI-rendered advertising scene.
- **Client-Side Gallery (IndexedDB)**: Saved creations persist locally with zero third-party cloud leaks; filter, view metadata, and download in 1 click.
- **Dedicated Prompt Guide**: Complete inspiration library with copyable templates for perfumes, skincare, beverages, sneakers, jewelry, and smartwatches.
- **Server Health & Diagnostic Dashboard**: Real-time verification of AI provider API key status, active provider detection, and rate limit counters.
- **Dark & Light Mode**: Curated warm-neutral luxury aesthetic with seamless theme transitions.

---

## 🏗️ Architecture

```
mockup-img-ai/
├── client/                     # Vite + React 18.3 + TypeScript 5.5 + TailwindCSS 3.4
│   ├── src/
│   │   ├── components/         # Uploader, PromptEditor, PresetSelector, AspectRatioSelector, GenerationPreview, Header, GenerationSettings
│   │   ├── hooks/              # IndexedDB useCreations hook
│   │   ├── pages/              # Studio, Creations, PromptGuide, Settings
│   │   ├── services/           # Axios API client & error extractor
│   │   ├── types/              # TypeScript definitions & interfaces
│   │   └── utils/              # Prompt builder & preset constants
│   ├── tailwind.config.js      # Custom theme: cream, charcoal, accent, warm palettes
│   ├── vite.config.ts          # Configured with proxy to server port 3005
│   ├── tsconfig.json           # ES2020 target, strict mode, bundler module resolution
│   └── postcss.config.js       # Tailwind + Autoprefixer
│
├── server/                     # Express 4.19 + TypeScript 5.5 (ES2022, CommonJS)
│   ├── src/
│   │   ├── middleware/         # Multer upload (10MB, image/*), Helmet security, CORS, Rate limiting, Global error handler
│   │   ├── routes/             # /api/generate, /api/health, /api/creations, /api/models
│   │   ├── services/           # Multi-provider image generation (Stability AI, OpenAI), Background removal, Compositing, Relighting
│   │   ├── types/              # Shared TypeScript types for providers & models
│   │   └── validators/         # Zod parameter validation schemas
│   ├── tests/                  # Vitest + Supertest suite (11 tests)
│   ├── tsconfig.json           # ES2022 target, CommonJS, strict, declaration maps
│   └── .env.example
│
├── package.json                # Workspace scripts (dev:server, dev:client, build:client, test, install:all)
└── server/.env.example         # Environment template
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v20/v22)
- **npm**: v9+
- **AI Provider API Key**: Choose one:
  - **Stability AI**: Get key from [platform.stability.ai](https://platform.stability.ai/account/keys)
  - **OpenAI**: Get key from [platform.openai.com](https://platform.openai.com/api-keys)

### 2. Configure Environment Variables
Inside the `server/` directory, create or edit `.env`:

```bash
cd server
cp .env.example .env
```

Edit `server/.env` — **configure exactly ONE provider**:
```env
# Server Configuration
PORT=3005
NODE_ENV=development

# Choose ONE provider (not both):
# STABILITY_API_KEY=sk-your_stability_key_here
# OR
# OPENAI_API_KEY=sk-your_openai_key_here

# Optional overrides
MAX_FILE_SIZE_MB=10
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MS=900000
FRONTEND_URL=http://localhost:5173
```

> **Note:** The server securely stores your API key on the backend and NEVER exposes it to the browser. Configuring both keys will cause a startup conflict error.

### 3. Run the Backend Server
```bash
cd server
npm install
npm run dev
```
Backend runs at `http://localhost:3005`. Health check endpoint: `http://localhost:3005/api/health`.

### 4. Run the Frontend Client
In a new terminal:
```bash
cd client
npm install
npm run dev
```
Client runs at `http://localhost:5173`.

### 5. Or Run Both with Workspace Scripts
From the root directory:
```bash
# Install all dependencies
npm run install:all

# Run server (terminal 1)
npm run dev:server

# Run client (terminal 2)
npm run dev:client
```

---

## 🧪 Testing

### Backend (Server)
```bash
cd server
npm test
```
All 11 integration tests verify:
- Health check & API key redaction
- Active provider detection (Stability vs OpenAI)
- Model discovery per provider
- Required product image validation
- Aspect ratio and model enum validation
- Error handling & route fallback
- Provider configuration conflicts

### Frontend (Client)
```bash
cd client
npm test
```
Vitest + React Testing Library + JSDOM for component tests.

### Run All Tests
```bash
npm test
```

---

## 🛡️ Production & Security Best Practices

1. **API Key Security**: AI provider API keys (Stability AI or OpenAI) are strictly held in Node.js environment variables. Client requests pass through `/api/generate` — keys never reach the browser.

2. **Provider Isolation**: Only one provider can be active at a time. Configuring both `OPENAI_API_KEY` and `STABILITY_API_KEY` triggers a startup conflict error (HTTP 500).

3. **File Validation**: Files are strictly validated via MIME type (`image/jpeg`, `image/png`, `image/webp`) and capped at 10 MB via Multer.

4. **Rate Limiting**: Built-in Express rate-limiter (default: 20 requests per 15 minutes) prevents denial-of-service and accidental API credit exhaustion.

5. **Security Headers**: Helmet.js configured with `crossOriginResourcePolicy: 'cross-origin'` for secure asset loading.

6. **CORS Protection**: Restricted to known frontend origins (`localhost:5173`, `localhost:4173`, configurable via `FRONTEND_URL`).

7. **No Server-Side Image Leaks**: Images are received in-memory and proxied directly as multipart payloads without persistent disk caching on the server.

8. **Input Validation**: All API parameters validated via Zod schemas before processing.

9. **Graceful Shutdown**: SIGTERM/SIGINT handlers for clean server shutdown in containerized environments.

---

## 🔧 Tech Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend Framework** | React | 18.3.1 |
| **Language** | TypeScript | 5.5.3 |
| **Build Tool** | Vite | 5.3.4 |
| **Styling** | Tailwind CSS | 3.4.6 |
| **Routing** | React Router DOM | 6.24.1 |
| **HTTP Client** | Axios | 1.7.2 |
| **Icons** | Lucide React | 0.400.0 |
| **Notifications** | React Hot Toast | 2.4.1 |
| **Testing** | Vitest + React Testing Library | 1.6.0 / 16.0.0 |
| **Backend Framework** | Express | 4.19.2 |
| **Runtime** | Node.js | 20+ |
| **Language** | TypeScript | 5.5.3 (ES2022, CommonJS) |
| **Dev Runner** | tsx | 4.16.2 |
| **Security** | Helmet, CORS, Rate Limit | 7.1.0 / 2.8.5 / 7.3.1 |
| **File Upload** | Multer | 1.4.5-lts.1 |
| **Image Processing** | Sharp | 0.33.4 |
| **Validation** | Zod | 3.23.8 |
| **AI Providers** | Stability AI SDK, OpenAI SDK | Native fetch / 7.43.0 |
| **Testing** | Vitest + Supertest | 1.6.0 / 7.0.0 |
| **Unique IDs** | UUID | 10.0.0 |
