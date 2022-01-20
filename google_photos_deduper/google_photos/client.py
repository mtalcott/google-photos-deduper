# import google.auth
# import requests
from textwrap import indent
from google.auth.transport.requests import AuthorizedSession
# import pprint
# import json
from google_photos_deduper.media_items.repository import MediaItemsRepository
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import logging
import pprint
import debugpy

class Client:
    """A simple class"""

    def __init__(self, session: AuthorizedSession):
        self.__configure_requests_session(session)
        self.session = session

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
                json=request_data
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

            logging.info(f'Retrieved {item_count} mediaItems so far')

        logging.info('Done retrieving mediaItems')

        # for media_item in self.repo.all():
        #     logging.info(pprint.pformat(media_item))

    def process_duplicates(self):
        logging.info("Processing duplicates (getting grouped mediaItems)...")

        grouped_media_items = list(self.repo.get_grouped_media_items())

        # for group in grouped_media_items:
        #     for line in pprint.pformat(group).splitlines():
        #         logging.info(line)
        
        logging.info("Done processing duplicates")

        album = self.__find_or_create_album()

        # logging.info(pprint.pformat(album))

        # TODO: Add duplicate mediaItems to album, with a reference to the "original" mediaItem (and maybe some attributes about both)

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
            # "pageSize": 100 # Appears to be unsupported on albums.list, results in a 400 response
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
                json=request_data # When specified as json, results in a 400 response. Using params instead.
            )
        resp_json = resp.json()

        return resp_json
    
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
