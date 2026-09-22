# PAUSE — PRD / Memoria di progetto

## Problem statement originale
"analizza e rendi la preview apribile" — l'utente ha caricato lo zip `PAUSE-4.8-main.zip` (progetto Emergent esistente) e chiede di analizzarlo e rendere la preview funzionante.

## Cos'è PAUSE
App mobile (Expo + FastAPI + MongoDB) di micro-apprendimento: curiosità e mini-lezioni di 2–3 minuti in 6 capitoli, con narrazione audio (TTS OpenAI via Emergent LLM key, opzionale ElevenLabs), categorie, bookmark, streak/statistiche, limite giornaliero (ENFORCE_LIMIT), premium via Stripe, i18n IT/EN.

## Architettura
- `backend/server.py` (~1400 righe): API `/api/*`, seed idempotente allo startup (13 categorie, 437 storie), sync copertine, ingest cache TTS in Emergent Object Storage.
- `backend/tts.py`, `storage.py`, `covers_sync.py`, `related.py` + molti script di seed/generazione contenuti (`seed_*.py`, `generate_*.py`, `v6_*.py`, `v8_*`).
- `frontend/app`: `index.tsx` (splash/redirect), `onboarding.tsx`, `(tabs)/{discover,explore,bookmarks,profile}`, `deep-dive/[id]` (reader), `browse`, `playlist`, `premium`, `stats`, `unlock`, `pause-limit`, `read-stories`.
- `frontend/src`: `api.ts`, `i18n.tsx`, `session.ts`, `premium.ts`, `reading-progress.ts`, player audio, componenti UI.

## Lavoro svolto (22/09/2026)
- Analisi zip: mancavano `frontend/.env` e `backend/.env` (causa della preview non apribile) e il DB.
- Ripristino del progetto in `/app` preservando `.env` dell'ambiente, `metro.config.js`, `eas.json`, `.git`, `.emergent`.
- `backend/.env`: aggiunti `EMERGENT_LLM_KEY`, `ENFORCE_LIMIT=false`, `STRIPE_API_KEY=` / `STRIPE_WEBHOOK_SECRET=` (vuoti su richiesta utente).
- Installate dipendenze mancanti (pip: elevenlabs, emoji, stripe…; yarn: vector-icons, expo-audio, expo-localization, expo-sharing, react-native-svg, react-native-view-shot).
- Startup: seed 437 storie, 15 mp3 della cache TTS migrati su Object Storage.
- Test agent (iteration_21): backend 10/10, frontend onboarding → discover → reader → bookmark → tab tutte OK.

## Non configurato (scelta utente)
- Stripe (Premium): checkout non funzionante finché non si inserisce `STRIPE_API_KEY`.
- ElevenLabs: TTS usa OpenAI via Emergent key.
- Audio e pagamenti non modificati in questo intervento grafico.

## Home e categorie — evoluzione 22/09/2026
### Richieste utente
- Icone e frecce coerenti/squadrate; posizione ordinata dei badge e titolo Home.
- Eliminare il flash della card appena passata a fine swipe.
- Ridisegnare i simboli da zero (non basta cambiare i contenitori).
- Serie SVG approvata: «belle le icone, tienile salvate da parte nel codice».
- Nuova serie: riempire le card con una sola illustrazione originale per categoria, prendendo solo spunto dallo screenshot, perfettamente integrata col design; applicare a Home, Argomenti e onboarding.
- Animali: richiesta finale **bassotto**, stesso stile vetro ambrato (sostituisce balena e primo cane).

### Implementato
- `home-story-deck.tsx`: card persistenti keyed per ID, passaggio di posizione e offset sullo stesso frame UI, nessun cambio sorgente immagine/crossfade al cambio card. Blocchi contro tap ripetuti, cancellazione animazioni all'unmount.
- `home-story-card.tsx`: tipo/durata in alto, categoria sopra titolo, CTA e palette mantenute.
- `discover.tsx`: gestione audience/reset/prefetch unificata, generation guard su risposte obsolete; piccoli schermi possono scorrere verticalmente.
- `home-controls.tsx`: frecce squadrate 48px e tessere 96px. Frecce SVG originali.
- **Archivio vettoriale intatto**: `category-icon.tsx`, 13 disegni originali. Selettore `CATEGORY_VISUAL_MODE` in `category-artwork.tsx`: `illustrated` (default) / `line`. Documentato in `components/CATEGORY_ART.md`. I vettori restano nei piccoli badge e come fallback.
- **14 illustrazioni originali**: 13 categorie + cristallo per Qualsiasi argomento. Un soggetto per card, stessa luce cyan/violet, materiale vetro/satinato, tinta categoria. Bassotto ambrato in Animali.
- Asset salvati in Emergent Managed Object Storage, WebP 480px da circa9–24KB ciascuno, percorso versionato/hash. Frontend carica via API dell'app con cache memory-disk e parametro versione.
- `backend/category_art_sources.json`: sorgenti originali; `import_category_art.py`: ottimizzazione/upload una tantum; `category_art_manifest.json`: associazioni persistenti; `category_artwork.py`: seed idempotente associazioni mancanti (mai rigenerazione AI a runtime).
- `/api/category-media/all` gestito da `design_assets`, non aggiunge una quattordicesima categoria nel catalogo. Gli altri endpoint media esistenti sono riutilizzati.
- Corretto offset laterale persistente della preview tra tab: animazione `shift` disattivata solo su web, mantenuta su native. RCA dopo osservazione ripetuta e timeout45s; screenshot successivo conferma Home x0 e grid x24.

### Verifica
- iteration22: regressione Home,20 transizioni avanti/indietro campionate senza flash.
- iteration23:13 SVG originali, tocco su icona, selezioni, IT/EN, tema chiaro/scuro,390/360/320px passati.
- Self-test ultime illustrazioni: catalogo13/13 con path, media Animali e all HTTP200 WebP,14 illustrazioni caricate nel picker, Home e filtro Animali passati.
- iteration24: UI, fallback, selezione, media validi, responsive e tab passati. Un test sui cache header della preview fallì: RCA ha verificato header immutable corretti all'origine, sovrascritti da no-store al gateway pubblico. Vincolo dell'ambiente, non bug applicativo; non cambiare infrastruttura protetta.
- Hardware iOS/Android non disponibile: verifiche sulla preview Expo mobile.
- `tsc --noEmit` ha3 errori preesistenti in stats.tsx (ViewShot ref / tuple gradient) e story-hero.tsx (ViewStyle/ImageStyle); nessuno nei nuovi componenti al momento dei primi controlli. Warning legacy pointerEvents web non bloccante.

## Backlog
- P0: sola conferma visiva utente sulle ultime illustrazioni e dimensioni; verifiche tecniche completate.
- P1: copertine storie mancanti, separate dalle nuove illustrazioni categoria.

## Ultima revisione richiesta (prioritaria)
- User approva Spazio/Tecnologia/Storia/Psicologia/Corpo umano: asset **invariati**.
- User vuole altri soggetti chiari anche senza etichette. Confermati e implementati:
  beuta Scienza, albero Natura, libro Cultura, monete Economia, tavolozza Arte, globo Geografia.
- Bassotto più vivo: pelo naturale, espressione, zampa sollevata; stesso contesto cromatico.
- Riduzione ottica:90% immagini nel picker,84% in Home; Home88px da96px, immagine~72px.
- Eliminata categoria Curiosità,28contenuti riassegnati, stessiID; adesso12categorie.
  Dettagli e backup: `memory/category_migration.md`, `backend/category_taxonomy.py`.
- Manifest asset v2 sostituisce solo7immagini; sorgenti v1/v2 e serieSVG preservate.
- Corretti due problemi del suggerimento introduttivo: fuori dal GestureDetector
  della card (chiuderlo non apre lettore); niente entering/exiting Reanimated su web,
  perché il clone di uscita spostava lateralmente la pagina di16px. Animazioni native mantenute.
- Ultimo selftest: Home/tessere88px/immagini72.23px, griglia12categorie x24 anche
  dopo chiusura suggerimento, filtroAnimali passati.
- **Iteration25 completata**:12/12testbackend passati;437contenuti invariati,
  28backup/confronti contenuti corretti, migrazione idempotente e fail-closed,
  preferiti/progressi compatibili; UI mobile390/360/320, selezioni, suggerimenti,
  cambi scheda/lingua e dimensioni passati. Nessun blocco nel perimetro richiesto.
  Report `/app/test_reports/iteration_25.json` e suite `backend/tests/test_iter25_curiosita_migration.py`.
- P1: configurare Stripe quando disponibile.
- P2: bundle identifier in `app.json` (`com.emergent.appopinionplatform.tcl8qx`) da confermare.
