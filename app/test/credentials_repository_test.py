import copy
import pytest
import app.config
from app.models.credentials_repository import CredentialsRepository
import pymongo

# These tests require a real mongo database connection
# Run `docker-compose up mongo` and
#   `TEST_DB=1 pytest app/test/credentials_repository_test.py`
#   in separate terminals
requires_mongodb = pytest.mark.skipif("os.environ.get('TEST_DB') is None")


@pytest.fixture
def collection():
    collection = pymongo.MongoClient(app.config.MONGODB_URI)[
        app.config.DATABASE
    ].credentials
    yield collection
    collection.drop()


@pytest.fixture
def user_id():
    return "test-user-id"


@pytest.fixture
def repo(user_id):
    return CredentialsRepository(user_id)


def test_init__requires_user_id():
    with pytest.raises(ValueError):
        CredentialsRepository(None)


@requires_mongodb
def test_set__create(collection, user_id, credentials, repo):
    """Should create new document"""
    repo.set(credentials)

    document = collection.find_one({"userId": user_id})
    assert document is not None
    assert dict(document).items() >= credentials.items()


@requires_mongodb
def test_create_or_update__update(collection, user_id, credentials, repo):
    """Should update existing document"""
    insert = collection.insert_one(
        credentials
        | {
            "userId": user_id,
            "token": "OTHER_TOKEN",
        }
    )
    repo.set(credentials)

    document = collection.find_one({"userId": user_id})
    assert document is not None
    assert document["token"] == credentials["token"]


@requires_mongodb
def test_get(collection, user_id, credentials, repo):
    """Should get the document with matching user_id"""
    other_user_id = "test-other-user-id"
    insert1 = collection.insert_one(credentials | {"userId": user_id})
    insert2 = collection.insert_one(
        credentials | {"token": "OTHER_TOKEN", "userId": other_user_id}
    )
    result = repo.get()

    assert type(result) == dict
    assert result["userId"] == user_id
    assert result["token"] == credentials["token"]
