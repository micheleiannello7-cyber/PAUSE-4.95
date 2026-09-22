"""
PAUSE — copertine "locali": file in backend/covers/<story-id>.<png|jpg|jpeg|webp>
(fornite dall'utente) vengono caricate in Object Storage all'avvio e collegate
alla storia (hero_image_generated). Così le copertine viaggiano col progetto
(git/export) e sopravvivono a fork e nuovi ambienti. Idempotente: salta le
storie che hanno già una copertina nello storage.
"""
import asyncio
import logging
import mimetypes
from pathlib import Path

from storage import put_object, get_object, APP_NAME

COVERS_DIR = Path(__file__).parent / "covers"
logger = logging.getLogger("covers")


def local_covers() -> dict[str, Path]:
    if not COVERS_DIR.exists():
        return {}
    out: dict[str, Path] = {}
    for p in sorted(COVERS_DIR.iterdir()):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            out[p.stem] = p
    return out


def _exists(path: str) -> bool:
    try:
        get_object(path)
        return True
    except Exception:
        return False


async def sync_local_covers(db) -> dict:
    stats = {"uploaded": 0, "linked": 0, "skipped": 0, "unknown": 0}
    for sid, file in local_covers().items():
        doc = await db.stories.find_one({"id": sid}, {"_id": 0, "hero_image_generated": 1})
        if not doc:
            stats["unknown"] += 1
            logger.warning("cover %s: nessuna storia con questo id", file.name)
            continue
        mime = mimetypes.guess_type(file.name)[0] or "image/png"
        ext = "jpg" if "jpeg" in mime else mime.split("/")[-1]
        path = f"{APP_NAME}/hero/{sid}.{ext}"
        current = doc.get("hero_image_generated")
        if current == path and await asyncio.to_thread(_exists, path):
            stats["skipped"] += 1
            continue
        await asyncio.to_thread(put_object, path, file.read_bytes(), mime)
        await db.stories.update_one({"id": sid}, {"$set": {"hero_image_generated": path}})
        stats["uploaded"] += 1
    return stats
