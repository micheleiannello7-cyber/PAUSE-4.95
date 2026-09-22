"""TTS module for PAUSE.

Generates HD audio narration for stories using OpenAI TTS via emergentintegrations
(voice="nova", model="tts-1-hd"). Audio files are cached on disk under
tts_cache/ keyed by SHA-256 of (story_id, lang, voice, model, kind). Playback is
served with FastAPI's FileResponse so the client (expo-audio) can seek via
HTTP Range requests.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Optional, List

import emoji
from emergentintegrations.llm.openai import OpenAITextToSpeech
from litellm import speech as _litellm_speech

from storage import put_object, get_object_optional

CACHE_DIR = Path(__file__).parent / "tts_cache"
CACHE_DIR.mkdir(exist_ok=True)

# Object Storage is the persistent home for narration audio (cheap, survives
# redeploys, keeps the project/git light). The local tts_cache/ is only a fast
# serving cache for HTTP Range playback and is rebuilt on demand from storage.
TTS_STORAGE_PREFIX = "pause/tts"


def _storage_object_path(key: str) -> str:
    return f"{TTS_STORAGE_PREFIX}/{key}.mp3"


def _write_disk(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(".mp3.tmp")
    with tmp.open("wb") as f:
        f.write(data)
    tmp.replace(path)

# Both languages use tts-1-hd (high-definition). The proxy only exposes
# tts-1 / tts-1-hd; gpt-4o-mini-tts (which supported style `instructions`) is
# no longer available, so we drop the instructions and rely on the input text.
# NOTE: all OpenAI TTS voices are English-optimised, so Italian narration keeps
# a slight English accent — that's a provider ceiling, not a bug.
MODEL_IT = "tts-1-hd"
MODEL_EN = "tts-1-hd"
MODEL = MODEL_EN  # legacy default; per-request pick below picks the right one

# Style instructions passed to gpt-4o-mini-tts to lock the accent in place —
# without this the same voice slips back into an English cadence on longer
# Italian passages.
IT_STYLE = (
    "Parla in italiano perfetto, con accento italiano nativo di Roma o di Milano, "
    "calmo, caldo e chiaro. Non usare mai accento inglese o americano. "
    "Pronuncia correttamente le parole italiane, gli accenti tonici e le doppie consonanti. "
    "Ritmo naturale e riflessivo, come una lettura per adulti curiosi in una PAUSA serale."
)
EN_STYLE = (
    "Speak in clear, warm, native English with a calm and thoughtful pace, "
    "as if reading a bedtime curiosity to a curious adult listener."
)

VOICE = "nova"
# Voices offered in the app: Nova is the free default, the others are Premium.
VOICES = ("nova", "onyx", "echo", "shimmer")
# OpenAI TTS accepts up to 4096 chars per request; leave a small margin.
CHUNK_CHARS = 3800

# --- ElevenLabs (native Italian narration) --------------------------------
# When a real ELEVENLABS_API_KEY is configured, Italian audio is generated with
# eleven_multilingual_v2 (no English accent). English keeps OpenAI. Any
# ElevenLabs failure (placeholder key, quota, network) falls back to OpenAI so
# playback never breaks. The four app voices map to ElevenLabs premade voices;
# override with ELEVENLABS_VOICE_MAP="nova:<id>,onyx:<id>,..." if desired.
ELEVEN_MODEL = "eleven_multilingual_v2"
ELEVEN_OUTPUT = "mp3_44100_128"
_ELEVEN_DEFAULT_VOICES = {
    "nova": "EXAVITQu4vr4xnSDxMaL",     # Sarah — warm, calm female
    "shimmer": "Xb7hH8MSUJpSbSDYk0k2",  # Alice — clear, bright female
    "onyx": "JBFqnCBsd6RMkjVDRZzb",     # George — deep, warm male
    "echo": "onwK4e9ZLuTAKqWW03F9",     # Daniel — steady male narrator
}
_PLACEHOLDER_KEYS = {"", "placeholder", "your_key_here", "changeme", "todo"}
# After a failed ElevenLabs call we stop trying for a while (monotonic secs)
# so a bad key doesn't add a failing round-trip to every playback.
ELEVEN_BACKOFF_SECONDS = 600
_eleven_disabled_until = 0.0


def eleven_key() -> Optional[str]:
    key = (os.environ.get("ELEVENLABS_API_KEY") or "").strip()
    return None if key.lower() in _PLACEHOLDER_KEYS else key


def _eleven_voice_id(voice: str) -> str:
    overrides = {}
    for pair in (os.environ.get("ELEVENLABS_VOICE_MAP") or "").split(","):
        name, _, vid = pair.strip().partition(":")
        if name and vid:
            overrides[name.strip()] = vid.strip()
    return overrides.get(voice) or _ELEVEN_DEFAULT_VOICES.get(voice) or _ELEVEN_DEFAULT_VOICES[VOICE]


def provider_for(lang: str) -> str:
    """'eleven' for Italian when a real key is set (and not backing off), else 'openai'."""
    import time
    if lang == "it" and eleven_key() and time.monotonic() >= _eleven_disabled_until:
        return "eleven"
    return "openai"


def tts_status() -> dict:
    return {
        "elevenlabs_configured": bool(eleven_key()),
        "provider_it": provider_for("it"),
        "provider_en": provider_for("en"),
    }


def _model_for(lang: str) -> str:
    return MODEL_IT if lang == "it" else MODEL_EN


def _style_for(lang: str) -> str:
    return IT_STYLE if lang == "it" else EN_STYLE


def resolve_voice(value: Optional[str]) -> str:
    return value if value in VOICES else VOICE

_tts: Optional[OpenAITextToSpeech] = None
_locks: dict[str, asyncio.Lock] = {}


def _client() -> OpenAITextToSpeech:
    global _tts
    if _tts is None:
        key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("EMERGENT_LLM_KEY not configured")
        _tts = OpenAITextToSpeech(api_key=key)
    return _tts


def clean_for_tts(text: str) -> str:
    """Strip emoji, urls, markdown and other symbols the narrator would read aloud."""
    text = emoji.replace_emoji(text, replace="")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|`]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _split_into_chunks(text: str, max_chars: int = CHUNK_CHARS) -> List[str]:
    """Split at sentence boundaries so each chunk fits in one TTS request."""
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    # Split on sentence-ending punctuation while keeping the punctuation.
    parts = re.split(r"(?<=[.!?…])\s+", text)
    chunks: List[str] = []
    buf = ""
    for p in parts:
        if not p:
            continue
        if len(buf) + len(p) + 1 <= max_chars:
            buf = f"{buf} {p}".strip()
        else:
            if buf:
                chunks.append(buf)
            # A single sentence may still exceed the limit — hard-slice it.
            while len(p) > max_chars:
                chunks.append(p[:max_chars])
                p = p[max_chars:]
            buf = p
    if buf:
        chunks.append(buf)
    return chunks


def _cache_key(story_id: str, lang: str, kind: str, voice: str = VOICE, provider: str = "openai") -> str:
    # Italian gets a new version tag now that we generate with gpt-4o-mini-tts
    # + native-accent instructions; English keeps the historical key so the
    # existing tts-1-hd cache stays valid. ElevenLabs audio lives under its own
    # tag so the OpenAI fallback cache is never mixed with native narration.
    if provider == "eleven":
        version, model = "v4-eleven", ELEVEN_MODEL
    else:
        version, model = ("v3-native" if lang == "it" else "v2"), _model_for(lang)
    payload = f"{story_id}|{lang}|{voice}|{model}|{kind}|{version}"
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def cache_path(story_id: str, lang: str, kind: str, voice: str = VOICE, provider: str = "openai") -> Path:
    return CACHE_DIR / f"{_cache_key(story_id, lang, kind, voice, provider)}.mp3"


def _has_file(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def is_cached(story_id: str, lang: str, kind: str, voice: str = VOICE) -> bool:
    """True if audio exists on disk for the active provider (or its fallback)."""
    voice = resolve_voice(voice)
    return any(_has_file(cache_path(story_id, lang, kind, voice, p)) for p in ("eleven", "openai"))


CHAPTER_LABEL = {"it": "Capitolo", "en": "Chapter"}


def _compose_full(story: dict, lang: str = "it") -> str:
    label = CHAPTER_LABEL.get(lang, CHAPTER_LABEL["it"])
    parts: List[str] = []
    if story.get("title"):
        parts.append(story["title"].rstrip(".") + ".")
    if story.get("hook"):
        parts.append(story["hook"])
    for ch in story.get("chapters", []) or []:
        # Announce the chapter number before the title so the listener always
        # knows where they are — e.g. "Capitolo 1. Un impero enorme."
        num = ch.get("number")
        title = (ch.get("title") or "").rstrip(".")
        if num is not None and title:
            parts.append(f"{label} {num}. {title}.")
        elif title:
            parts.append(title + ".")
        if ch.get("body"):
            parts.append(ch["body"])
    if story.get("summary"):
        parts.append(story["summary"])
    return clean_for_tts(" ".join(parts))


def _compose_preview(story: dict) -> str:
    # ~5 seconds of speech: title + first sentence of hook.
    title = (story.get("title") or "").rstrip(".") + "."
    hook = story.get("hook") or ""
    first = re.split(r"(?<=[.!?…])\s+", hook.strip())[0] if hook else ""
    return clean_for_tts(f"{title} {first}").strip()


async def _generate_bytes(text: str, voice: str = VOICE, lang: str = "it") -> bytes:
    """Call OpenAI TTS in a thread. Uses `litellm.speech` directly so we can:
      • target `gpt-4o-mini-tts` for Italian (native-accent, multilingual)
      • pass a style `instructions` prompt (unsupported by tts-1-hd, ignored
        there by the API — so it's a no-op for the English path)
      • route through the Emergent proxy when the key is sk-emergent-*.
    """
    model = _model_for(lang)
    style = _style_for(lang)
    api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    params: dict = {
        "model": f"openai/{model}",
        "input": text,
        "voice": voice,
        "api_key": api_key,
    }
    if api_key.startswith("sk-emergent-"):
        proxy = os.getenv("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com")
        params["api_base"] = proxy + "/llm"
        params["custom_llm_provider"] = "openai"

    def _run() -> bytes:
        resp = _litellm_speech(**params)
        if hasattr(resp, "content"):
            return resp.content
        if hasattr(resp, "read"):
            return resp.read()
        return bytes(resp)
    return await asyncio.to_thread(_run)


async def _generate_bytes_eleven(text: str, voice: str = VOICE, lang: str = "it") -> bytes:
    """Native-accent narration via ElevenLabs eleven_multilingual_v2 (mp3)."""
    from elevenlabs import ElevenLabs, VoiceSettings

    key = eleven_key()
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")
    voice_id = _eleven_voice_id(voice)

    def _run() -> bytes:
        client = ElevenLabs(api_key=key, timeout=120)
        stream = client.text_to_speech.convert(
            voice_id,
            text=text,
            model_id=ELEVEN_MODEL,
            output_format=ELEVEN_OUTPUT,
            language_code=lang,
            voice_settings=VoiceSettings(stability=0.55, similarity_boost=0.8, style=0.15, use_speaker_boost=True),
        )
        return b"".join(chunk for chunk in stream if chunk)
    data = await asyncio.to_thread(_run)
    if not data:
        raise RuntimeError("ElevenLabs returned empty audio")
    return data


async def _synthesize(text: str, voice: str, lang: str, provider: str) -> bytes:
    """Chunk the text and concatenate the mp3 blobs for the given provider.
    Concatenating well-formed MP3 streams byte-wise plays back seamlessly in
    expo-audio; a single request stays a single file."""
    gen = _generate_bytes_eleven if provider == "eleven" else _generate_bytes
    blobs: List[bytes] = []
    for c in _split_into_chunks(text):
        blobs.append(await gen(c, voice, lang))
    return b"".join(blobs)


VOICE_SAMPLE_TEXT = {
    "it": "Ciao, sono {name}. Sarò la tua voce su PAUSE: una storia alla volta, con calma.",
    "en": "Hi, I'm {name}. I'll be your voice on PAUSE: one story at a time, at your pace.",
}


async def generate_voice_sample(voice: str, lang: str, db=None) -> Path:
    """Short greeting used by the voice picker. Cached like any story audio."""
    voice = resolve_voice(voice)
    text = VOICE_SAMPLE_TEXT.get(lang, VOICE_SAMPLE_TEXT["it"]).format(name=voice.capitalize())
    story = {"id": f"voice-sample-{voice}", "title": "", "hook": text, "chapters": [], "summary": ""}
    return await generate_story_audio(story, lang, preview=False, db=db, voice=voice)


async def generate_story_audio(story: dict, lang: str, preview: bool = False, db=None, voice: str = VOICE) -> Path:
    """Ensure the mp3 for a story is available on disk and return its path.

    Provider: ElevenLabs for Italian when configured (native accent), OpenAI
    otherwise. If ElevenLabs fails we transparently fall back to OpenAI and
    back off for a while, so playback never breaks on a bad/placeholder key.

    Lookup order per provider (each layer materialises the next when it hits):
      1. Local disk cache under tts_cache/ (survives backend restart)
      2. MongoDB `tts_audio` collection (survives redeploy — this is what
         the platform migrates from preview to production on first deploy)
      3. The TTS API (only when neither layer has the file — this is what
         costs credits)

    The disk copy is what the /api/tts/story handler serves so we keep
    HTTP Range support; the DB copy is the persistent source of truth.
    """
    global _eleven_disabled_until
    kind = "preview" if preview else "full"
    voice = resolve_voice(voice)
    provider = provider_for(lang)
    try:
        return await _ensure_audio(story, lang, kind, voice, provider, db)
    except Exception as exc:
        if provider != "eleven":
            raise
        import time
        _eleven_disabled_until = time.monotonic() + ELEVEN_BACKOFF_SECONDS
        logging.getLogger(__name__).warning(
            "ElevenLabs failed for %s (%s); falling back to OpenAI for %ss", story["id"], exc, ELEVEN_BACKOFF_SECONDS,
        )
        return await _ensure_audio(story, lang, kind, voice, "openai", db)


async def _ensure_audio(story: dict, lang: str, kind: str, voice: str, provider: str, db) -> Path:
    path = cache_path(story["id"], lang, kind, voice, provider)
    if _has_file(path):
        return path

    # Serialize per-story to avoid duplicate work if two clients hit at once.
    lock = _locks.setdefault(path.name, asyncio.Lock())
    async with lock:
        if _has_file(path):
            return path

        key = _cache_key(story["id"], lang, kind, voice, provider)
        obj_path = _storage_object_path(key)

        # Layer 2 — Object Storage. Persistent, cheap, survives redeploys. If the
        # audio was generated before, hydrate the disk cache from it.
        try:
            data = await asyncio.to_thread(get_object_optional, obj_path)
        except Exception:
            data = None
        if data:
            _write_disk(path, data)
            return path

        # Legacy — audio generated before the Object Storage switch still lives
        # as a blob in MongoDB. Migrate it once: hydrate disk + copy to storage.
        if db is not None:
            doc = await db.tts_audio.find_one({"key": key}, {"_id": 0, "data": 1})
            if doc and doc.get("data"):
                blob = doc["data"]
                _write_disk(path, blob)
                try:
                    await asyncio.to_thread(put_object, obj_path, blob, "audio/mpeg")
                    await _mark_uploaded(db, key, len(blob))
                except Exception:
                    pass
                return path

        # Layer 3 — actually call the TTS API (this is what costs credits).
        text = _compose_preview(story) if kind == "preview" else _compose_full(story, lang)
        if not text:
            raise ValueError("Empty text after cleanup")

        payload = await _synthesize(text, voice, lang, provider)
        _write_disk(path, payload)

        # Persist to Object Storage so the audio survives redeploys and keeps the
        # project/git light. Non-fatal — the disk copy still serves this run.
        try:
            await asyncio.to_thread(put_object, obj_path, payload, "audio/mpeg")
            await _mark_uploaded(db, key, len(payload))
        except Exception:
            logging.getLogger(__name__).warning("TTS upload to Object Storage failed for %s", key)

        return path


async def _mark_uploaded(db, key: str, size: int) -> None:
    """Record a key as present in Object Storage so the startup ingest can skip
    re-uploading it. Tiny metadata-only doc (no audio bytes)."""
    if db is None:
        return
    try:
        await db.tts_uploaded.update_one(
            {"key": key}, {"$set": {"key": key, "size": size}}, upsert=True,
        )
    except Exception:
        pass


async def ingest_disk_cache_into_storage(db=None) -> dict:
    """One-shot migration: upload every mp3 already on disk into Object Storage.

    Called at backend startup so a project imported from a zip (or an older
    build that only had the disk cache) becomes cross-deploy persistent on the
    cloud. Idempotent: keys already recorded in `tts_uploaded` are skipped so we
    don't re-upload the whole cache on every restart.
    """
    uploaded = 0
    seen = 0
    done_keys: set[str] = set()
    if db is not None:
        async for d in db.tts_uploaded.find({}, {"_id": 0, "key": 1}):
            done_keys.add(d["key"])
    for f in CACHE_DIR.glob("*.mp3"):
        seen += 1
        key = f.stem  # cache_key hex prefix
        if key in done_keys:
            continue
        try:
            data = f.read_bytes()
            await asyncio.to_thread(put_object, _storage_object_path(key), data, "audio/mpeg")
            await _mark_uploaded(db, key, len(data))
            uploaded += 1
        except Exception:
            continue
    return {"seen": seen, "uploaded": uploaded}

