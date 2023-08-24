# import pprint
# import json
import logging
import os
from typing import Union
import pymongo
from bson.objectid import ObjectId
from app import config


class MediaItemsRepository:
    """
    Repository for Google Images media items (photo and video metadata) stored
    in MongoDB.
    """

    attribute_names = [
        "id",  # mediaItem ID, not Mongo ID (which is _id)
        "filename",
        "mediaMetadata",
        "mimeType",
        "productUrl",
        "baseUrl",
        "storageFilename",  # Locally stored filename per MediaItemsImageStore
        "size",  # Size in bytes
        "deletedAt",  # When the media item was deleted by our app
        "userUrl",  # User-facing URL of the media item. productUrl is generated for our app and eventually expires.
    ]

    @classmethod
    def create_indexes(cls):
        instance = cls("1")
        instance._create_indexes()

    def __init__(self, user_id: str):
        if not user_id:
            raise ValueError("user_id is required")

        self.user_id = user_id

        client = pymongo.MongoClient(config.MONGODB_URI)
        self.db = client[config.DATABASE]
        self.collection = self.db.media_items

    def get_id_map(self, ids):
        result = self.collection.find(
            {
                "id": {"$in": ids},
                "userId": self.user_id,
            }
        )
        return {item["id"]: item for item in result}

    def create_or_update(self, attributes: dict):
        attr = {
            k: v
            for (k, v) in attributes.items()
            if k in MediaItemsRepository.attribute_names
        }
        attr |= {"userId": self.user_id}

        return self.collection.update_one(
            {"id": attr["id"], "userId": self.user_id},
            {"$set": attr},
            upsert=True,
        )

    def update(self, id: str, attributes: dict):
        attribute_names = [n for n in MediaItemsRepository.attribute_names if n != "id"]
        attr = {k: v for (k, v) in attributes.items() if k in attribute_names}
        self.collection.update_one(
            {"id": id, "userId": self.user_id},
            {"$set": attr},
        )

        return self.collection.find_one({"id": id, "userId": self.user_id})

    def delete(self, ids: Union[list[str], set[str]]) -> None:
        self.collection.delete_many(
            {
                "id": {"$in": list(ids)},
                "userId": self.user_id,
            }
        )

    def all(self):
        return (
            self.collection.find({"userId": self.user_id})
            # Order by creationTime ascending, so we can easily identify
            #   the earliest created mediaItem as the original
            .sort("mediaMetadata.creationTime", 1)
            # Prevent out of memory errors by allowing MongoDB to write to temp
            #   files (default memory limit is 100MB)
            .allow_disk_use(True)
        )

    def count(self) -> int:
        return self.collection.count_documents({"userId": self.user_id})

    def all_ids(self) -> set[str]:
        result = self.collection.find(
            {"userId": self.user_id},
            projection={"id": 1, "_id": 0},
        )
        return {item["id"] for item in result}

    def _create_indexes(self) -> None:
        index_info = self.collection.index_information()
        logging.info(f"Existing indexes: {index_info}")

        index1_name = "media_items_user_id_media_item_id_idx"
        if index1_name not in index_info:
            self.collection.create_index(
                [("user_id", pymongo.ASCENDING), "id"],
                unique=True,
                name=index1_name,
            )
            logging.info(f"Created index {index1_name}")

        index2_name = "media_items_user_id_idx"
        if index2_name not in index_info:
            self.collection.create_index(
                "user_id",
                name=index2_name,
            )
            logging.info(f"Created index {index2_name}")
