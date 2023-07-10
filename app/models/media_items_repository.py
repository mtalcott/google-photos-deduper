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
        existing = self.db.media_items.find_one({
            'id':     attributes['id'],
            'userId': self.user_id})
        
        if existing:
            return existing
        
        attributes = {k:v for (k,v) in attributes.items() if k in MediaItemsRepository.attribute_names}
        attributes['userId'] = self.user_id
        return self.db.media_items.insert_one(attributes)

    def all(self):
        return list(self.db.media_items.find())
    
    def count(self):
        return self.db.media_items.count_documents({})

    def get_media_item_groups(self):
        results = self.db.media_items.aggregate([
            # TODO: Re-add logic to filter down to the current userId
            # {
            #     # Filter down to this user's media items
            #     "$match": {
            #         "userId": self.user_id
            #     }
            # },
            {
                # Order by creationTime ascending, so we can easily identify
                #   the earliest created mediaItem as the original
                "$sort": {"mediaMetadata.creationTime": 1}
            }, {
                # Group by attributes that indicate duplicate media items
                "$group": {
                    "_id": {
                        "filename": "$filename",
                        "mimeType": "$mimeType",
                        "height":   "$mediaMetadata.height",
                        "width":    "$mediaMetadata.width"
                    },
                    "count": {"$sum": 1},
                    "_ids":  {"$push": "$_id"}, # Mongo ids
                    "ids":   {"$push": "$id"}   # mediaItem ids
                }
            }, {
                # Filter down to only groups that contain duplicates
                "$match": {
                    "count": {"$gt": 1}
                }
            }
        ])

        return list(results)

class Error(Exception):
    """Base class for exceptions in this module."""
    pass
