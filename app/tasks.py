import celery
import celery.utils.log
from urllib.error import HTTPError
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_photos_client import GooglePhotosClient
from app import server  # required for building URLs
from app import CELERY_APP as celery_app

logger = celery.utils.log.get_logger(__name__)


@celery.shared_task(bind=True)
def process_duplicates(
    self: celery.Task,
    credentials: dict,
    refresh_media_items: bool = False,
):
    def update_status(m, state="PROGRESS"):
        # `meta` comes through as `info` field on result
        self.update_state(state=state, meta=m)

    try:
        client = GooglePhotosClient(
            credentials,
            update_status=update_status,
        )

        if refresh_media_items or client.local_media_items_count() == 0:
            client.fetch_media_items()

        media_items_count = client.local_media_items_count()
        update_status(f"Processing duplicates for {media_items_count:,} media items...")

        # media_item_groups = list(self.repo.get_media_item_groups())
        # num_groups = len(media_item_groups)
        # num_duplicates = sum([len(group["all"]) for group in media_item_groups])

        # for group in media_item_groups:
        #     for line in pprint.pformat(group).splitlines():
        #         update_status(line)

        # album = __find_or_create_album()

        # update_status(pprint.pformat(album))

        media_items = list(client.get_local_media_items())
        duplicate_detector = DuplicateImageDetector()
        clusters = duplicate_detector.calculate_clusters(media_items)

        result = {
            "groups": [],
        }

        for group_index, media_item_indices in enumerate(clusters):
            raw_media_items = [media_items[i] for i in media_item_indices]

            # These are already sorted by creationDate asc, so the original mediaItem is the lowest index
            original_media_item_id = media_items[min(media_item_indices)]["id"]

            group_media_items = []
            group = {
                "id": group_index,
                "media_items": group_media_items,
            }

            for raw_media_item in raw_media_items:
                # Remove _id as it's an ObjectId and is not JSON-serializable
                media_item = {
                    k: raw_media_item[k] for k in raw_media_item if k != "_id"
                }
                if raw_media_item["id"] == original_media_item_id:
                    media_item["type"] = "original"
                else:
                    media_item["type"] = "duplicate"
                group_media_items.append(media_item)

            result["groups"].append(group)

        return result

    except HTTPError as error:
        if error.status == 403:
            update_status(
                "HTTP Error 403 Forbidden encoutered. Please log out and reauthenticate.",
                state="FAILURE",
            )
        elif error.status == 401:
            update_status(
                "HTTP Error 401 Unauthorized encountered. Please log out and reauthenticate.",
                state="FAILURE",
            )
        else:
            raise error
