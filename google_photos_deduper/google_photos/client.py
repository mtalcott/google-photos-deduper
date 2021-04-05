# import google.auth
# import requests
from google.auth.transport.requests import AuthorizedSession
# import pprint
# import json


class Client:
    """A simple class"""

    def __init__(self, session: AuthorizedSession):
        session.hooks = {
            'response': lambda r, *args, **kwargs: r.raise_for_status()
        }
        self.session = session

    def run(self):
        max_items = 200
        next_page_token = None
        item_count = 0
        params = {
            "pageSize": 100
        }
        
        while item_count < max_items:
            if (next_page_token):
                params['pageToken'] = next_page_token

            resp = self.session.get(
                'https://photoslibrary.googleapis.com/v1/mediaItems',
                params=params
            )
            resp_json = resp.json()

            # pprint.pp(resp_json)
            # print(json.dumps(resp_json, indent=4, sort_keys=True))
        
            for media_item_json in resp_json['mediaItems']:
                pass
            
            item_count += len(resp_json['mediaItems'])
            next_page_token = resp_json['nextPageToken']

            print(f'Retrieved {item_count} mediaItems so far')

        
        print('Done')
