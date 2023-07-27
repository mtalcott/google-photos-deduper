import os
import app.config
from PIL import Image
import urllib.request


class MediaItemsImageStore:
    """Stores images on the filesystem.
    When and if hosted publicly, encapsulating here will make it easy
    to move to a cloud storage provider like S3.
    """

    def __init__(self, resolution=100):
        self.resolution = resolution

    def store_image(self, media_item) -> str:
        url = self._get_image_url(media_item)
        path = self._get_storage_path(media_item)
        # If we already have a local copy, don't download it again
        if not os.path.isfile(path):
            urllib.request.urlretrieve(url, path)

        return self.get_storage_filename(media_item)

    def get_image(self, media_item) -> Image:
        path = self._get_storage_path(media_item)
        return Image.open(path)

    def get_storage_filename(self, media_item) -> str:
        extension = os.path.splitext(media_item["filename"])[1]
        return f"{media_item['id']}.{extension}"

    def _get_storage_path(self, media_item) -> str:
        return os.path.join(
            app.config.IMAGE_STORE_PATH,
            self.get_storage_filename(media_item),
        )

    def _get_image_url(self, media_item) -> str:
        return f"{media_item['baseUrl']}=w{self.resolution}-h{self.resolution}"
