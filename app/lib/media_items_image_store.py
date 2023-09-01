import logging
import os
import time
import app.config
import requests


class MediaItemsImageStore:
    """Stores images on the filesystem.
    When and if hosted publicly, encapsulating here will make it easy
    to move to a cloud storage provider like S3.
    """

    def __init__(self, resolution=250):
        self.resolution = resolution

    def store_image(self, media_item) -> str:
        url = self._image_url(media_item)
        path = self._storage_path(media_item)
        # If we already have a local copy, don't download it again
        if not os.path.isfile(path):
            attempts = 3
            success = False
            while not success:
                try:
                    response = requests.get(url, timeout=5)
                    response.raise_for_status()
                    with open(path, "wb") as file:
                        file.write(response.content)
                    success = True
                except requests.exceptions.RequestException as error:
                    attempts -= 1
                    sleep_time = app.config.RESPONSE_FAILURE_RETRY_SECONDS
                    if error.response is not None and error.response.status_code == 429:
                        sleep_time = app.config.RESPONSE_429_RETRY_SECONDS
                    logging.warning(
                        f"Received {error} downloading image\n"
                        f"media_item: {media_item}\n"
                        f"url: {url}\n"
                        f"attempts left: {attempts}\n"
                        f"sleeping for {sleep_time} seconds before retrying"
                    )
                    time.sleep(sleep_time)
                    if attempts <= 0:
                        raise error

        return self._storage_filename(media_item)

    def get_storage_path(self, storage_filename: str) -> str:
        return os.path.join(
            app.config.IMAGE_STORE_PATH,
            storage_filename,
        )

    def _storage_filename(self, media_item) -> str:
        # These are all JPEG images (baseUrl for movies is a thumbnail)
        return f"{media_item['id']}-{self.resolution}.jpg"

    def _storage_path(self, media_item) -> str:
        return os.path.join(
            app.config.IMAGE_STORE_PATH,
            self._storage_filename(media_item),
        )

    def _image_url(self, media_item) -> str:
        return f"{media_item['baseUrl']}=w{self.resolution}-h{self.resolution}"
