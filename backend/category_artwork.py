"""Versioned, original category art. Media lives in managed object storage.

This manifest lets a fresh database recover asset associations without generating
or uploading anything again. User/story data and existing later artwork are kept.
"""
import json
from pathlib import Path


async def ensure_category_artwork(db):
    manifest = json.loads((Path(__file__).parent / "category_art_manifest.json").read_text())
    for category_id, path in manifest["artworks"].items():
        fields = {"illustration_generated": path, "illustration_revision": manifest["version"]}
        if category_id == "all":
            await db.design_assets.update_one(
                {"id": "category-all"}, {"$setOnInsert": fields}, upsert=True,
            )
        else:
            await db.categories.update_one(
                {"id": category_id, "$or": [
                    {"illustration_generated": {"$exists": False}},
                    {"illustration_generated": None},
                    {"illustration_generated": ""},
                    {"illustration_revision": "glass-2026-09-v1"},
                ]},
                {"$set": fields},
            )