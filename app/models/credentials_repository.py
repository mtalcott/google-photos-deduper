import pymongo
from app import config


class CredentialsRepository:
    """
    Repository for Google credentials stored in MongoDB.
    """

    attribute_names = [
        "token",
        "refresh_token",
        "scopes",
    ]

    def __init__(self, user_id: str):
        if not user_id:
            raise ValueError("user_id is required")

        self.user_id = user_id

        client = pymongo.MongoClient(config.MONGODB_URI)
        self.db = client[config.DATABASE]
        self.collection = self.db.credentials

    def get(self):
        result = self.collection.find_one({"userId": self.user_id})
        if result is None:
            return result

        return self._slice_credential_items(result)

    def set(self, credentials: dict):
        attributes = self._slice_credential_items(credentials)
        attributes |= {"userId": self.user_id}

        return self.collection.update_one(
            {"userId": self.user_id},
            {"$set": attributes},
            upsert=True,
        )

    def _slice_credential_items(self, dict: dict):
        return {
            k: v
            for (k, v) in dict.items()
            if k in CredentialsRepository.attribute_names
        }
