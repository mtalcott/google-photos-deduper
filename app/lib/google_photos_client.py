import time
from app.lib.google_api_client import GoogleApiClient
from app.lib.media_items_image_store import MediaItemsImageStore
from app.models.media_items_repository import MediaItemsRepository


class GooglePhotosClient(GoogleApiClient):
    def __init__(
        self,
        *args,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        user_id = self.get_user_id()
        self.image_store = MediaItemsImageStore()
        self.repo = MediaItemsRepository(user_id=user_id)
        self.image_store = MediaItemsImageStore()

    def local_media_items_count(self):
        return self.repo.count()

    def clear_local_media_items(self):
        self.repo.delete_all()

    def fetch_media_items(self):
        self.clear_local_media_items()
        # TODO: clear local image store?

        max_items = 20_000
        next_page_token = None
        item_count = 0
        request_data = {"pageSize": 100}

        self.logger.info("Fetching mediaItems...")
        last_log_time = time.time()

        while item_count < max_items:
            if next_page_token:
                request_data["pageToken"] = next_page_token

            def func():
                return self.session.get(
                    "https://photoslibrary.googleapis.com/v1/mediaItems",
                    params=request_data,
                ).json()

            resp_json = self._refresh_credentials_if_invalid(func)

            if "mediaItems" in resp_json:
                for media_item_json in resp_json["mediaItems"]:
                    # The baseUrls that the Google Images API provides expire
                    # and start returning 403s after a few hours, so we cache a
                    # local copy as soon as we get the URLs so we don't have to
                    # refresh them later for long-running tasks.
                    storage_filename = self.image_store.store_image(media_item_json)
                    media_item_json["storageFilename"] = storage_filename

                    self.repo.create_or_update(media_item_json)

                    item_count += 1

                    # Log every 3 seconds
                    if last_log_time < time.time() - 3:
                        self.logger.info(f"Fetched {item_count:,} mediaItems so far")
                        last_log_time = time.time()

            next_page_token = resp_json.get("nextPageToken", None)
            if not next_page_token:
                break

        self.logger.info(f"Done fetching mediaItems, {item_count:,} total")

    def get_local_media_items(self):
        return self.repo.all()
