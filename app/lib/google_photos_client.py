import logging
from app.lib.google_api_client import GoogleApiClient
from app.models.media_items_repository import MediaItemsRepository
from typing import Callable


class GooglePhotosClient(GoogleApiClient):
    def __init__(
        self,
        credentials: dict,
        update_status: Callable[[str], None],
    ):
        super().__init__(credentials)
        self._update_status = update_status

        user_info = self.get_user_info()
        self.user_id = user_info["id"]
        self.repo = MediaItemsRepository(user_id=self.user_id)

    def local_media_items_count(self):
        return self.repo.count()

    def fetch_media_items(self):
        max_items = 2_000
        next_page_token = None
        item_count = 0
        request_data = {"pageSize": 100}

        self.update_status("Fetched mediaItems...")

        while item_count < max_items:
            if next_page_token:
                request_data["pageToken"] = next_page_token

            resp = self.session.get(
                "https://photoslibrary.googleapis.com/v1/mediaItems",
                params=request_data,
            )
            resp_json = resp.json()

            # self.update_status(pprint.pformat(resp_json))
            # self.update_status(json.dumps(resp_json, indent=4, sort_keys=True))

            if "mediaItems" in resp_json:
                for media_item_json in resp_json["mediaItems"]:
                    self.repo.create_if_not_exists(media_item_json)

                item_count += len(resp_json["mediaItems"])

            next_page_token = resp_json.get("nextPageToken", None)
            if not next_page_token:
                break

            self.update_status(f"Fetched {item_count:,} mediaItems so far")

        self.update_status(f"Done retrieving mediaItems, {item_count:,} total")

        # for media_item in self.repo.all():
        #     self.update_status(pprint.pformat(media_item))

    def get_local_media_items(self):
        return self.repo.all()

    # TODO: The maximum number of mediaItems per album is 20,000. Add logic to split across multiple albums.
    # def process_duplicates(self):
    #     self.update_status("Processing duplicates (getting grouped mediaItems)...")

    #     media_item_groups = list(self.repo.get_media_item_groups())
    #     num_groups = len(media_item_groups)
    #     num_duplicates = sum([len(group["all"]) for group in media_item_groups])

    #     self.update_status(
    #         f"Done processing duplicates. Found {num_duplicates:,} duplicate mediaItems across {num_groups:,} groups"
    #     )
    #     # for group in media_item_groups:
    #     #     for line in pprint.pformat(group).splitlines():
    #     #         self.update_status(line)

    #     # album = self.__find_or_create_album()

    #     # self.update_status(pprint.pformat(album))

    #     result = {
    #         "groups": [],
    #     }

    #     for index, group in enumerate(media_item_groups):
    #         raw_media_items = group["all"]
    #         # Remove _id as it's an ObjectId and is not JSON-serializable
    #         media_items = [{k: m[k] for k in m if k != "_id"} for m in raw_media_items]

    #         # These are already sorted by creationDate asc, so the original mediaItem is the first one
    #         original_media_item = media_items[0]

    #         group_media_items = []
    #         group = {
    #             "id": index,  # TODO: Hack! Replace these with real dupe group IDs
    #             "media_items": group_media_items,
    #         }

    #         for media_item in media_items:
    #             if media_item["id"] == original_media_item["id"]:
    #                 media_item["type"] = "original"
    #             else:
    #                 media_item["type"] = "duplicate"
    #             group_media_items.append(media_item)

    #         result["groups"].append(group)

    #     # print(f"Adding {len(duplicate_media_items):,} duplicate mediaItems to the album")
    #     # self.__add_media_items_to_album(duplicate_media_items, album['id'])

    #     return result

    # def __find_or_create_album(self):
    #     album_title = f"google-photos-deduper-python userid-{self.user_id}"

    #     self.update_status("Looking for an existing album...")
    #     existing_album = self.__find_existing_album_with_name(album_title)

    #     if existing_album:
    #         self.update_status(f"Existing album \"{album_title}\" found")
    #         return existing_album

    #     new_album = self.__create_album_with_name(album_title)
    #     self.update_status(f"No existing album found, created new album \"{album_title}\"")

    #     return new_album

    # def __find_existing_album_with_name(self, album_title):
    #     next_page_token = None
    #     request_data = {
    #         "pageSize": 50 # Max 50 for albums.list
    #     }

    #     while True:
    #         if (next_page_token):
    #             request_data['pageToken'] = next_page_token

    #         resp = self.session.get(
    #             'https://photoslibrary.googleapis.com/v1/albums',
    #             params=request_data # When specified as json, results in a 400 response. Using params instead.
    #         )
    #         resp_json = resp.json()

    #         # self.update_status(pprint.pformat(resp_json))

    #         if 'albums' in resp_json:
    #             for album_json in resp_json['albums']:
    #                 if album_json.get('title', None) == album_title:
    #                     return album_json

    #         next_page_token = resp_json.get('nextPageToken', None)
    #         if not next_page_token:
    #             break

    #     return None

    # def __create_album_with_name(self, album_title):
    #     request_data = {
    #         "album": {
    #             "title": album_title
    #         }
    #     }

    #     resp = self.session.post(
    #             'https://photoslibrary.googleapis.com/v1/albums',
    #             json=request_data
    #         )
    #     resp_json = resp.json()

    #     return resp_json

    # def __add_media_items_to_album(self, media_items, album_id):
    #     media_item_ids = [i['id'] for i in media_items]

    #     # Chunk into groups of 50, otherwise 400 errors occur
    #     media_item_id_chunks = (media_item_ids[i:i + 50] for i in range(0, len(media_item_ids), 50))
    #     for chunk in media_item_id_chunks:

    #         request_data = {
    #             "mediaItemIds": chunk
    #         }

    #         try:
    #             resp = self.session.post(
    #                     f'https://photoslibrary.googleapis.com/v1/albums/{album_id}:batchAddMediaItems',
    #                     json=request_data
    #                 )
    #             resp_json = resp.json()

    #             return resp_json
    #         except HTTPError as error:
    #             # TODO: See if there's a way around these "Request contains an invalid media item id." 400 errors
    #             #
    #             # Unfortunately, according to https://developers.google.com/photos/library/guides/manage-albums#creating-new-album:
    #             # > You can only add media items that have been uploaded by your application to albums that your application has created
    #             debugpy.breakpoint()
    #             pass

    def update_status(self, message):
        if self._update_status:
            self._update_status(message)
