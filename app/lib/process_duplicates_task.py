import copy
import datetime
import logging
import celery
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_photos_client import GooglePhotosClient
from app import server  # required for building URLs
from app import CELERY_APP as celery_app


class Steps:
    FETCH_MEDIA_ITEMS = "fetch_media_items"
    PROCESS_DUPLICATES = "process_duplicates"

    all = [FETCH_MEDIA_ITEMS, PROCESS_DUPLICATES]


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

        # Initialize meta structure
        self.meta = {"logMessage": None}
        self.meta["steps"] = {
            step: {"startedAt": None, "completedAt": None} for step in Steps.all
        }

    def run(self):
        self.start_step(Steps.FETCH_MEDIA_ITEMS)
        client = GooglePhotosClient.from_user_id(self.user_id, logger=self.logger)

        if self.refresh_media_items or client.local_media_items_count() == 0:
            client.fetch_media_items()

        media_items_count = client.local_media_items_count()
        self.complete_step(Steps.FETCH_MEDIA_ITEMS, count=media_items_count)
        self.start_step(Steps.PROCESS_DUPLICATES)

        self.logger.info(
            f"Processing duplicates for {media_items_count:,} media items..."
        )

        media_items = list(client.get_local_media_items())
        # Skip videos for now. We don't get video length from metadata;
        #   comparing by thumbnail on its own results in too many
        #   false positives.
        media_items = list(
            filter(lambda m: m["mimeType"].startswith("image/"), media_items)
        )
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

            # The first item in the cluster is the one that is most similar to
            # all the others. Use that as the "original" media item.
            # https://github.com/UKPLab/sentence-transformers/blob/a458ce79c40fef93d5ecc66931b446ea65fdd017/sentence_transformers/util.py#L351C26-L351C95
            original_media_item_id = media_items[min(media_item_indices)]["id"]

            group_media_items = []
            group = {
                "id": group_index,
                "mediaItems": group_media_items,
            }

            for raw_media_item in raw_media_items:
                # Just provide a list of media item IDs. The rest we can fetch
                #   on demand from mongo to make sure we have the latest data.
                media_item = {"id": raw_media_item["id"]}
                # Set is_original flag on first
                media_item["isOriginal"] = (
                    raw_media_item["id"] == original_media_item_id
                )

                group_media_items.append(media_item)

            result["groups"].append(group)

        self.complete_step(Steps.PROCESS_DUPLICATES, count=len(result["groups"]))

        return result

    # Celery's `update_state` method overwrites the `info`/`meta` field.
    #   Store our own local meta so we don't have to read it from Redis for
    #   every update
    def update_meta(
        self,
        log_message=None,
        start_step_name=None,
        complete_step_name=None,
        count=None,
    ):
        """
        Update local meta, then call celery method to update task state.
        """
        if log_message:
            self.meta["logMessage"] = log_message

        now = datetime.datetime.now().astimezone().isoformat()
        if start_step_name:
            self.meta["steps"][start_step_name]["startedAt"] = now
            if count:
                self.meta["steps"][start_step_name]["count"] = count
        if complete_step_name:
            self.meta["steps"][complete_step_name]["completedAt"] = now
            if count:
                self.meta["steps"][complete_step_name]["count"] = count

        self.task.update_state(
            # If we don't pass a state, it gets updated to blank.
            # Let's use PROGRESS to differentate from PENDING.
            state="PROGRESS",
            # `meta` field comes through as the `info` field on task async result.
            meta={"meta": self.meta},
        )

    def get_meta(self):
        return copy.deepcopy(self.meta)

    def start_step(self, step):
        self.update_meta(start_step_name=step)

    def complete_step(self, step, count=None):
        self.update_meta(complete_step_name=step, count=count)
