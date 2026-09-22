"""
PAUSE — copertine AI per TUTTO il catalogo, in ordine di anzianità (seed order),
partendo dai contenuti più vecchi ancora senza copertina.

Riusa generate_and_upload di generate_images.py (Gemini Nano Banana + Object
Storage). Idempotente: salta chi ha già `hero_image_generated`. Se la chiave
esaurisce il budget si ferma subito invece di fallire una per una.

Usage:
    cd /app/backend && python generate_covers.py            # tutte le mancanti
    cd /app/backend && python generate_covers.py --limit 50
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
sys.path.insert(0, str(ROOT_DIR))

from generate_images import generate_and_upload  # noqa: E402
from image_prompts import STORY_IMAGE_PROMPTS, LESSON_IMAGE_PROMPTS  # noqa: E402
from storage import APP_NAME  # noqa: E402

CONCURRENCY = 3
STYLE = (
    " Vertical 3:4 composition, dark cinematic editorial mood, magazine-quality photography, "
    "moody premium lighting with subtle cyan/magenta rim light, ultra-detailed, "
    "no text, no letters, no logos, no watermark."
)


def budget_error(e: Exception) -> bool:
    m = str(e).lower()
    return any(k in m for k in ("budget", "insufficient", "402", "quota", "credit"))


def prompt_for(doc: dict) -> str:
    sid = doc["id"]
    if doc.get("kind") == "lesson":
        base = LESSON_IMAGE_PROMPTS.get(sid)
        if base:
            return base.replace("16:9", "vertical 3:4")
        return (
            f"Conceptual editorial cover photograph for a mini-lesson titled '{doc.get('title', '')}' "
            f"(topic: {doc.get('category_name', '')}). Visual idea: {doc.get('hook', '')} "
            "Show a single concrete, recognisable subject related to the lesson, no close-up faces." + STYLE
        )
    base = STORY_IMAGE_PROMPTS.get(sid)
    if base:
        return base.replace("16:9", "vertical 3:4")
    return (
        f"Photorealistic editorial cover photograph for an article titled '{doc.get('title', '')}' "
        f"(topic: {doc.get('category_name', '')}). Visual idea: {doc.get('hook', '')} "
        "Show the concrete subject of the title, clearly recognisable." + STYLE
    )


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Seed order = anzianità del catalogo (stessa lista di server.ALL_STORIES).
    from seed_data import STORIES  # noqa: E402
    from seed_lessons_a import LESSONS as LESSONS_A  # noqa: E402
    from seed_lessons_b import LESSONS_B  # noqa: E402
    order = [s["id"] for s in list(STORIES) + list(LESSONS_A) + list(LESSONS_B)]
    docs = await db.stories.find(
        {}, {"_id": 0, "id": 1, "kind": 1, "title": 1, "hook": 1, "category_name": 1, "hero_image_generated": 1}
    ).to_list(3000)
    by_id = {d["id"]: d for d in docs}
    todo = [by_id[i] for i in order if i in by_id and not by_id[i].get("hero_image_generated")]
    todo += [d for d in docs if d["id"] not in order and not d.get("hero_image_generated")]
    if args.limit:
        todo = todo[: args.limit]
    total = len(todo)
    print(f"missing covers: {total}", flush=True)

    sem = asyncio.Semaphore(CONCURRENCY)
    stop = asyncio.Event()
    stats = {"ok": 0, "fail": 0}

    async def one(i, doc):
        if stop.is_set():
            return
        sid = doc["id"]
        async with sem:
            if stop.is_set():
                return
            try:
                path = await generate_and_upload(f"pause-cover-{sid}", prompt_for(doc), f"{APP_NAME}/hero/{sid}.png")
                await db.stories.update_one({"id": sid}, {"$set": {"hero_image_generated": path}})
                stats["ok"] += 1
                print(f"[{i}/{total}] OK   {sid}", flush=True)
            except Exception as e:  # noqa: BLE001
                stats["fail"] += 1
                print(f"[{i}/{total}] FAIL {sid}: {str(e)[:160]}", flush=True)
                if budget_error(e):
                    print("!! budget esaurito: mi fermo", flush=True)
                    stop.set()

    await asyncio.gather(*(one(i, d) for i, d in enumerate(todo, 1)))
    print(f"[done] ok={stats['ok']} fail={stats['fail']} stopped={stop.is_set()}", flush=True)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
