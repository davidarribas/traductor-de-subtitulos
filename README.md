# Subtitle Translator

🇪🇸 [Léelo en español](README.es.md)

Translate **.srt** and **.vtt** subtitle files with AI: Claude, Gemini, GPT, DeepSeek, Qwen or a local model in LM Studio. It runs entirely in your browser. Nothing to install, nothing to build, and no server of its own.

**Try it:** https://davidarribas.github.io/traductor-de-subtitulos/

## How to use it

1. Open the page: the [web version](https://davidarribas.github.io/traductor-de-subtitulos/), or locally with `index.html` or `Iniciar.command` (macOS).
2. Click **🔑 API keys** and paste the key for the provider you want to use.
3. Drop your subtitle file. The app detects its language and suggests translating it into the interface language (if the file is already in that language, it suggests English or Spanish). Target languages you have used before show up as quick buttons.
4. Optional, but it improves the result a lot: describe the video under **About the video** and fill in the **Glossary**.
5. Click **Translate**. Review and fix anything you need in the table, then download the `.srt`.

To fix an acronym or term repeated across many lines, use **Search and replace** above the table. If you are not happy with the result, **Clear translation** keeps the file loaded so you can try another model.

Your work is saved in the browser automatically. If you close the tab, you will be offered to restore it next time. **Save project** downloads a `.json` you can open on another computer.

## Interface language

The app is available in Spanish and English. It picks one from your browser language, and you can switch with the **ES/EN** selector at the top (or with `?lang=en` / `?lang=es` in the URL). To add another language, copy a block in `i18n.js` and translate it. Pull requests are welcome.

## Engines and recommended models

| Engine | Models it suggests | Key |
|---|---|---|
| **Claude** (direct) | Sonnet 5.5 (recommended), Haiku 5.5 (very cheap), Opus 5.5 (top quality) | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **OpenRouter** | The latest model of each family: Gemini Flash, Gemini, Claude, GPT, DeepSeek and Qwen. The list updates itself | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **OpenAI** | The three most recent GPT models on your account | [platform.openai.com](https://platform.openai.com/api-keys) |
| **LM Studio** | The models you have downloaded (Qwen and Gemma are highlighted) | Not needed |

**Show all models** lists everything else.

**About temperature (faithfulness):** it defaults to 0.5. Current Claude models (since Opus 4.7) and GPT‑6 no longer allow changing it, so the control is disabled for them and faithfulness comes from the instructions, which ask the model to stick to the original.

## How it translates

- **Real batches:** 40 subtitles per request (configurable) and up to 3 requests at a time. A 1,500-line film is about 40 requests, not 1,500.
- **The full transcript as context:** the model sees the whole video, not just a fragment, so names, tone and sentences that run across subtitles stay consistent. That part is cached by the provider, so you only pay for it in full once. Each batch also carries the last few translated lines.
- **JSON answers with one id per subtitle:** no line gets lost or shifted. Missing lines are requested again; if they still fail, they are marked in red instead of being skipped.
- **Line breaks are preserved** and the model keeps lines to about 42 characters (16 for Chinese, Japanese and Korean).
- **Speaker labels:** `Speaker 1:`, `[Speaker 2]`, `>>`, a name on its own line or `<v Name>` (VTT) are detected and removed before translating. You can also download the **clean original**.
- **Visible errors:** rate limits (HTTP 429) are retried automatically with an on-screen notice, never a blocking pop-up.

## LM Studio (local models, free)

1. In LM Studio, open the **Developer** tab, load a model and start the server.
2. In the server settings, turn on **Enable CORS**.
3. In the app, choose the **LM Studio** engine and click ↻.

Qwen and Gemma models usually translate well. With small models, use batches of 20.

## Running it locally

Open `index.html` directly, or on macOS double-click `Iniciar.command`: it starts a small server at `http://localhost:8765` and opens your browser.

## Privacy

- API keys are stored in the browser's `localStorage`. If you untick “Remember keys”, they only last until you close the tab.
- No analytics, no sign-up, no middle server: subtitles go straight from your browser to the provider you choose.

## Credits

Built by [David Arribas](https://davidarribas.net) on top of [Subtitle Translator for LM Studio](https://github.com/TTomas65/Subtitle-Translator-for-LM-Studio) by TTomas65 (MIT license). The original version is kept in `v1-antigua/`.

## Changelog

### 2.1 (November 2026)
- Spanish and English interface, with automatic detection and an ES/EN selector. Strings live in `i18n.js`.
- The default target language follows the interface language.
- Fixed target buttons replaced by recent targets.
- README in English (`README.md`) and Spanish (`README.es.md`).

### 2.0 (November 2026)
- Rewritten from scratch: about 1,500 lines instead of about 4,900.
- New engine shared by all providers: JSON batches, retries for missing lines only, full context with caching and parallel requests.
- Direct Claude support (Haiku, Sonnet and Opus 5.5) and recommended-model lists that update themselves.
- Language detection, smart default target and temperature 0.5 by default.
- Speaker label removal, line breaks preserved, .vtt import and export, bilingual .srt export.
- Search and replace, clear translation / start over, autosave, help, onboarding, mobile layout and accessibility.
- Reads `.wrk` files from version 1.
