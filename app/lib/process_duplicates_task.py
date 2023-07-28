import copy
import logging
import celery
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_photos_client import GooglePhotosClient
from app import server  # required for building URLs
from app import CELERY_APP as celery_app


class ProcessDuplicatesTask:
    def __init__(
        self,
        task: celery.Task,
        user_id: str,
        refresh_media_items: bool = False,
        logger: logging.Logger = logging,
    ):
        self.task = task
        self.user_id = user_id
        self.refresh_media_items = refresh_media_items
        self.logger = logger
        self.meta = {}  # Store our own meta locally

    def run(self):
        client = GooglePhotosClient.from_user_id(self.user_id, logger=self.logger)

        if self.refresh_media_items or client.local_media_items_count() == 0:
            client.fetch_media_items()

        media_items_count = client.local_media_items_count()

        self.logger.info(
            f"Processing duplicates for {media_items_count:,} media items..."
        )

        media_items = list(client.get_local_media_items())
        duplicate_detector = DuplicateImageDetector(
            media_items,
            logger=self.logger,
        )
        similarity_map = duplicate_detector.calculate_similarity_map()
        clusters = duplicate_detector.calculate_clusters()

        result = {
            "similarityMap": similarity_map,
            "groups": [],
        }

        for group_index, media_item_indices in enumerate(clusters):
            raw_media_items = [media_items[i] for i in media_item_indices]

            # These are already sorted by creationDate asc, so the original mediaItem is the lowest index
            original_media_item_id = media_items[min(media_item_indices)]["id"]

            group_media_items = []
            group = {
                "id": group_index,
                "mediaItems": group_media_items,
            }

            for raw_media_item in raw_media_items:
                # Remove _id as it's an ObjectId and is not JSON-serializable
                media_item = {
                    k: raw_media_item[k] for k in raw_media_item if k != "_id"
                }
                # Set is_original flag
                media_item["isOriginal"] = (
                    raw_media_item["id"] == original_media_item_id
                )

                group_media_items.append(media_item)

            result["groups"].append(group)

        return result

    # Celery's `update_state` method overwrites the `info`/`meta` field.
    #   Store our own local meta so we don't have to read it from Redis for
    #   every update
    def update_meta(self, thing="that", log_message=None):
        """
        Update local meta, then call celery method to update task state.
        """
        if log_message:
            self.meta["logMessage"] = log_message

        self.task.update_state(
            # If we don't pass a state, it gets updated to blank.
            # Let's use PROGRESS to differentate from PENDING.
            state="PROGRESS",
            # `meta` field comes through as the `info` field on task async result.
            meta={"meta": self.meta},
        )

    def get_meta(self):
        return copy.deepcopy(self.meta)
