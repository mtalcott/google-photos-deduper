# import google.auth
# import requests
from textwrap import indent
from google.auth.transport.requests import AuthorizedSession
# import pprint
# import json
from google_photos_deduper.media_items.repository import MediaItemsRepository
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from requests.exceptions import HTTPError
import logging
import pprint
import debugpy

class Client:
    """A simple class"""

    def __init__(self, session: AuthorizedSession):
        self.__configure_requests_session(session)
        self.session = session

        # TODO: Handle requests.exceptions.HTTPError: 401 Client Error: Unauthorized for url: https://www.googleapis.com/userinfo/v2/me
        user_info = self.__get_user_info()
        self.user_id = user_info['id']
        self.repo = MediaItemsRepository(user_id=self.user_id)

    def local_media_items_count(self):
        return self.repo.count()

    def retrieve_media_items(self):
        max_items = 100_000
        next_page_token = None
        item_count = 0
        request_data = {
            "pageSize": 100
        }

        logging.info('Retrieving mediaItems...')
        
        while item_count < max_items:
            if (next_page_token):
                request_data['pageToken'] = next_page_token

            resp = self.session.get(
                'https://photoslibrary.googleapis.com/v1/mediaItems',
                params=request_data
            )
            resp_json = resp.json()

            # logging.info(pprint.pformat(resp_json))
            # logging.info(json.dumps(resp_json, indent=4, sort_keys=True))
        
            if 'mediaItems' in resp_json:
                for media_item_json in resp_json['mediaItems']:
                    self.repo.create_if_not_exists(media_item_json)
                
                item_count += len(resp_json['mediaItems'])
            
            next_page_token = resp_json.get('nextPageToken', None)
            if not next_page_token:
                break

            logging.info(f'Retrieved {item_count:,} mediaItems so far')

        logging.info(f"Done retrieving mediaItems, {item_count:,} total")

        # for media_item in self.repo.all():
        #     logging.info(pprint.pformat(media_item))

    # TODO: The maximum number of mediaItems per album is 20,000. Add logic to split across multiple albums.
    def process_duplicates(self):
        logging.info("Processing duplicates (getting grouped mediaItems)...")

        media_item_groups = list(self.repo.get_media_item_groups())
        num_groups = len(media_item_groups)
        num_duplicates = sum([len(group['ids']) for group in media_item_groups])

        logging.info(f"Done processing duplicates. Found {num_duplicates:,} duplicate mediaItems across {num_groups:,} groups")
        # for group in media_item_groups:
        #     for line in pprint.pformat(group).splitlines():
        #         logging.info(line)

        album = self.__find_or_create_album()

        # logging.info(pprint.pformat(album))

        duplicate_media_items = []

        for group in media_item_groups:
            group_attributes = group['_id'] # filename, mimeType, height, width
            mongo_ids = group['_ids']
            media_item_ids = group['ids']
            group_count = group['count']

            # These are already sorted by creationDate asc, so the original mediaItem is the first one
            original_media_item_id = media_item_ids[0]

            for media_item_id in media_item_ids:
                if media_item_id == original_media_item_id:
                    continue

                duplicate_media_items.append({
                    "id": media_item_id,
                    "duplicate_of": original_media_item_id
                })

        # debugpy.breakpoint()
        print(f"Adding {len(duplicate_media_items):,} duplicate mediaItems to the album")
        self.__add_media_items_to_album(duplicate_media_items, album['id'])

    def __find_or_create_album(self):
        album_title = f"google-photos-deduper-python userid-{self.user_id}"

        logging.info("Looking for an existing album...")
        existing_album = self.__find_existing_album_with_name(album_title)

        if existing_album:
            logging.info(f"Existing album \"{album_title}\" found")
            return existing_album

        new_album = self.__create_album_with_name(album_title)
        logging.info(f"No existing album found, created new album \"{album_title}\"")

        return new_album 

    def __find_existing_album_with_name(self, album_title):
        next_page_token = None
        request_data = {
            "pageSize": 50 # Max 50 for albums.list
        }

        while True:
            if (next_page_token):
                request_data['pageToken'] = next_page_token
            
            resp = self.session.get(
                'https://photoslibrary.googleapis.com/v1/albums',
                params=request_data # When specified as json, results in a 400 response. Using params instead.
            )
            resp_json = resp.json()

            # logging.info(pprint.pformat(resp_json))
        
            if 'albums' in resp_json:
                for album_json in resp_json['albums']:
                    if album_json.get('title', None) == album_title:
                        return album_json

            next_page_token = resp_json.get('nextPageToken', None)
            if not next_page_token:
                break

        return None

    def __create_album_with_name(self, album_title):
        request_data = {
            "album": {
                "title": album_title
            }
        }

        resp = self.session.post(
                'https://photoslibrary.googleapis.com/v1/albums',
                json=request_data
            )
        resp_json = resp.json()

        return resp_json
    
    def __add_media_items_to_album(self, media_items, album_id):
        media_item_ids = [i['id'] for i in media_items]

        # Chunk into groups of 50, otherwise 400 errors occur
        media_item_id_chunks = (media_item_ids[i:i + 50] for i in range(0, len(media_item_ids), 50))
        for chunk in media_item_id_chunks:

            request_data = {
                "mediaItemIds": chunk
            }

            try:
                resp = self.session.post(
                        f'https://photoslibrary.googleapis.com/v1/albums/{album_id}:batchAddMediaItems',
                        json=request_data   
                    )
                resp_json = resp.json()

                return resp_json
            except HTTPError as error:
                # TODO: See if there's a way around these "Request contains an invalid media item id." 400 errors
                debugpy.breakpoint()
                pass
    
    def __configure_requests_session(self, session):
        # Automatically raise errors 
        session.hooks = {
            'response': lambda r, *args, **kwargs: r.raise_for_status()
        }

        # Retry up to 3 times on 503 response
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[503]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)

    def __get_user_info(self):
        return self.session.get('https://www.googleapis.com/userinfo/v2/me').json()
