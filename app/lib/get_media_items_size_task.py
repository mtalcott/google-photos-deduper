import logging
import time

import requests

from app.models.media_items_repository import MediaItemsRepository


class GetMediaItemsSizeTask:
    def __init__(
        self,
        user_id: str,
        media_item_ids: list[str],
        logger: logging.Logger = logging,
    ):
        self.user_id = user_id
        self.media_item_ids = media_item_ids
        self.logger = logger

        self.repo = MediaItemsRepository(user_id=user_id)

    def run(self):
        media_item_id_map = self.repo.get_id_map(self.media_item_ids)

        num_completed = 0
        num_total = len(self.media_item_ids)
        last_log_time = time.time()

        for media_item_id in self.media_item_ids:
            media_item = media_item_id_map[media_item_id]

            # If we already retrieved the size, don't do it again
            if "size" not in media_item:
                size = self._get_media_item_size(media_item)
                self.repo.update(media_item_id, {"size": size})

            num_completed += 1

            # Log every 3 seconds
            if last_log_time < time.time() - 3:
                self.logger.info(
                    f"Retrieved sizes for {num_completed} of {num_total} media items"
                )
                last_log_time = time.time()

        self.logger.info(f"Done retrieving sizes for {num_total} media items")

    def _get_media_item_size(self, media_item_json) -> int:
        """
        Returns the size of the media item in bytes via the content-length header
        from the media item download url.
        """

        # See https://developers.google.com/photos/library/guides/access-media-items#base-urls
        if "video" in media_item_json:
            url = f"{media_item_json['baseUrl']}=dv"
        else:
            url = f"{media_item_json['baseUrl']}=d"

        attempts = 3
        success = False
        while not success:
            try:
                response = requests.head(
                    url,
                    timeout=20,
                    allow_redirects=True,
                )
                # Raise exception if status code is not 2xx
                response.raise_for_status()
                size = response.headers["content-length"]
                success = True
            except requests.exceptions.RequestException as error:
                attempts -= 1
                if (
                    isinstance(error, requests.exceptions.HTTPError)
                    and error.response.status_code == 429
                ):
                    logging.warn(
                        f"Received {error} getting media item size\n"
                        f"See https://developers.google.com/photos/library/guides/api-limits-quotas#general-quota-limits\n"
                        f"Sleeping 60s before retry..."
                    )
                    time.sleep(60)
                else:
                    logging.warn(
                        f"Received {error} getting media item size\n"
                        f"media_item_json: {media_item_json}\n"
                        f"url: {url}\n"
                        f"attempts left: {attempts}"
                    )
                if attempts <= 0:
                    self.logger.warn(
                        f"Failed to get media item size, received {error}. Skipping.\n"
                        f"media_item_json: {media_item_json}"
                    )
                    return None

        return int(size)
