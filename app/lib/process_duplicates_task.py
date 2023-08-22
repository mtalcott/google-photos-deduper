import copy
import datetime
import logging
import time
from typing import Union
import celery
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_photos_client import GooglePhotosClient
from app import server, tasks  # required for building URLs
from app import CELERY_APP as celery_app


class Steps:
    FETCH_MEDIA_ITEMS = "fetch_media_items"
    PROCESS_DUPLICATES = "process_duplicates"

    all = [FETCH_MEDIA_ITEMS, PROCESS_DUPLICATES]


class Subtask:
    STORE_IMAGES = "store_images"
    GET_MEDIA_ITEMS_SIZE = "get_media_items_size"

    types = [STORE_IMAGES, GET_MEDIA_ITEMS_SIZE]
    type_type = Union[STORE_IMAGES, GET_MEDIA_ITEMS_SIZE]

    def __init__(self, type: type_type, result: celery.result.AsyncResult):
        self._type = type
        self._result = result

    @property
    def type(self) -> type_type:
        return self._type

    @property
    def result(self) -> celery.result.AsyncResult:
        return self._result


class ProcessDuplicatesTask:
    SUBTASK_BATCH_SIZE = 100

    def __init__(
        self,
        task: celery.Task,
        user_id: str,
        refresh_media_items: bool = False,
        resolution: int = 250,
        similarity_threshold: float = 0.99,
        logger: logging.Logger = logging,
    ):
        self.task = task
        self.user_id = user_id
        self.refresh_media_items = refresh_media_items
        self.resolution = resolution
        self.similarity_threshold = similarity_threshold
        self.logger = logger

        # Initialize meta structure
        self.meta = {"logMessage": None}
        self.meta["steps"] = {
            step: {"startedAt": None, "completedAt": None} for step in Steps.all
        }

        # Initialize subtasks structure for async results
        self.fetched_media_item_ids: list[dict] = []
        self.subtasks: list[Subtask] = []

    def run(self):
        self.start_step(Steps.FETCH_MEDIA_ITEMS)
        client = GooglePhotosClient.from_user_id(
            self.user_id,
            logger=self.logger,
        )

        if self.refresh_media_items or client.local_media_items_count() == 0:
            self._fetch_media_items(client)
            self._await_subtask_completion()

        media_items_count = client.local_media_items_count()
        self.complete_step(Steps.FETCH_MEDIA_ITEMS, count=media_items_count)
        self.start_step(Steps.PROCESS_DUPLICATES)

        self.logger.info(
            f"Processing duplicates for {media_items_count:,} media items..."
        )

        media_items = list(client.get_local_media_items())
        duplicate_detector = DuplicateImageDetector(
            media_items,
            logger=self.logger,
            threshold=self.similarity_threshold,
        )
        similarity_map = duplicate_detector.calculate_similarity_map()
        clusters = duplicate_detector.calculate_clusters()

        result = {
            "similarityMap": similarity_map,
            "groups": [],
        }

        for group_index, media_item_indices in enumerate(clusters):
            group_media_items = [media_items[i] for i in media_item_indices]

            group_sizes = [m["size"] for m in group_media_items]

            # Choose the media item with largest size as the original.
            if len(set(group_sizes)) > 1:
                largest = group_sizes.index(max(group_sizes))
                original_media_item_id = group_media_items[largest]["id"]
            else:
                # Otherwise, the first item in the cluster is the one that is most
                # similar to all the others. Prefer that as the "original" media
                # item, since we don't get created/uploaded times from the API.
                # https://github.com/UKPLab/sentence-transformers/blob/a458ce79c40fef93d5ecc66931b446ea65fdd017/sentence_transformers/util.py#L351C26-L351C95
                original_media_item_id = media_items[min(media_item_indices)]["id"]

            result["groups"].append(
                {
                    "id": str(group_index),
                    "mediaItemIds": [m["id"] for m in group_media_items],
                    "originalMediaItemId": original_media_item_id,
                }
            )

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
            # Let's use PROGRESS to differentiate from PENDING.
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

    def _fetch_media_items(self, client: GooglePhotosClient):
        def fetch_callback(media_item_json):
            self.fetched_media_item_ids.append(media_item_json["id"])
            if len(self.fetched_media_item_ids) >= self.SUBTASK_BATCH_SIZE:
                self._postprocess_fetched_media_items()

        # Fetch media items, passing success callback
        client.fetch_media_items(callback=fetch_callback)

        # Fetch any remaining media items
        self._postprocess_fetched_media_items()

    def _postprocess_fetched_media_items(self):
        media_item_ids = self.fetched_media_item_ids
        if len(media_item_ids) == 0:
            return

        store_images_result = tasks.store_images.delay(
            self.user_id,
            media_item_ids,
            self.resolution,
        )
        self.subtasks.append(Subtask(Subtask.STORE_IMAGES, store_images_result))

        get_media_items_size_result = tasks.get_media_items_size.delay(
            self.user_id,
            media_item_ids,
        )
        self.subtasks.append(
            Subtask(Subtask.GET_MEDIA_ITEMS_SIZE, get_media_items_size_result)
        )

        self.fetched_media_item_ids = []

    def _await_subtask_completion(self):
        """
        Wait for all subtasks to complete.
        """
        while True:
            subtask_results = [s.result for s in self.subtasks]
            num_completed = [r.ready() for r in subtask_results].count(True)
            num_total = len(self.subtasks)
            if num_completed == num_total:
                # All done.
                break
            else:
                message = (
                    f"Waiting for subtasks to complete... "
                    f"({num_completed} / {num_total})"
                )
                self.logger.info(message)
                time.sleep(3)
