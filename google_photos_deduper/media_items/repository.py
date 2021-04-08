# import pprint
# import json
import os
from pymongo import MongoClient
from bson.objectid import ObjectId


class MediaItemsRepository:
    """A simple class"""

    attribute_names = [
        'id',  # mediaItem ID, not Mongo ID (which is _id)
        'filename',
        'mediaMetadata',
        'mimeType',
        'productUrl'
    ]

    def __init__(self, user_id):
        if not user_id:
            raise Error('must provide a user_id')
        
        self.user_id = user_id

        client = MongoClient(os.environ.get('MONGODB_URI'))
        self.db = client[os.environ.get('DATABASE')]

    def get(self, id: int):
        pass
    
    def create_if_not_exists(self, attributes: dict):
        existing = self.db.media_items.find_one({'id': attributes['id']})
        if existing:
            return existing
        
        return self.db.media_items.insert_one(
            {k:v for (k,v) in attributes.items() if k in MediaItemsRepository.attribute_names}
        )

    def all(self):
        return self.db.media_items.find()


class Error(Exception):
    """Base class for exceptions in this module."""
    pass
