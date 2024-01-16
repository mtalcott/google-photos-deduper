import logging
import time
from typing import Optional

from app.lib.media_items_image_store import MediaItemsImageStore
from app.models.media_items_repository import MediaItemsRepository


class StoreImagesTask:
    def __init__(
        self,
        user_id: str,
        media_item_ids: list[str],
        resolution: Optional[int] = None,
        logger: logging.Logger = logging,
    ):
        self.user_id = user_id
        self.media_item_ids = media_item_ids
        self.resolution = resolution
        self.logger = logger

        self.repo = MediaItemsRepository(user_id=user_id)

        image_store_args = {}
        if resolution:
            image_store_args["resolution"] = resolution
        self.image_store = MediaItemsImageStore(**image_store_args)

    def run(self):
        media_item_id_map = self.repo.get_id_map(self.media_item_ids)

        num_completed = 0
        num_total = len(self.media_item_ids)
        last_log_time = time.time()

        for media_item_id in self.media_item_ids:
            media_item = media_item_id_map[media_item_id]

            try:
                storage_filename = self.image_store.store_image(media_item)
                self.repo.update(media_item_id, {"storageFilename": storage_filename})
            except Exception as error:
                # Displaying and processing mediaItems requires we have an actual
                #   image file to work with (referenced by storageFilename). If
                #   we are unable to obtain an image for a particular mediaItem,
                #   we'll delete the mediaItem from the collection (rather than
                #   adding logic to handle this case everywhere else).
                # See https://github.com/mtalcott/google-photos-deduper/issues/23
                logging.error(
                    f"Received {error} storing image, deleting mediaItem\n"
                    f"media_item: {media_item}\n"
                )
                self.repo.delete([media_item_id])

            num_completed += 1

            # Log every 3 seconds
            if last_log_time < time.time() - 3:
                self.logger.info(
                    f"Stored images for {num_completed} of {num_total} media items"
                )
                last_log_time = time.time()

        self.logger.info(f"Done storing images for {num_total} media items")
