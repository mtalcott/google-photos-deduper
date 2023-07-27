import copy
import pytest
import app.config
from app.models.media_items_repository import MediaItemsRepository
import app.models.media_items_repository
import pymongo

# These tests require a real mongo database connection
# Run `docker-compose up mongo` and
#   `TEST_DB=1 pytest app/test/media_items_repository_test.py`
#   in separate terminals
requires_mongodb = pytest.mark.skipif("os.environ.get('TEST_DB') is None")


@pytest.fixture
def database():
    return


@pytest.fixture
def collection():
    collection = pymongo.MongoClient(app.config.MONGODB_URI)[
        app.config.DATABASE
    ].media_items
    yield collection
    collection.drop()


@pytest.fixture
def user_id():
    return "test-user-id"


@pytest.fixture
def repo(user_id):
    return MediaItemsRepository(user_id)


def test_init__requires_user_id():
    with pytest.raises(app.models.media_items_repository.Error):
        MediaItemsRepository(None)


@requires_mongodb
def test_create_or_update__create(collection, user_id, media_item, repo):
    """Should create new document"""
    repo.create_or_update(media_item)

    document = collection.find_one({"id": media_item["id"]})
    assert document is not None
    assert document["userId"] == user_id


@requires_mongodb
def test_create_or_update__update(collection, user_id, media_item, repo):
    """Should update existing document"""
    insert = collection.insert_one(
        media_item
        | {
            "userId": user_id,
            "filename": "other-filename.jpg",
        }
    )
    repo.create_or_update(media_item)

    document = collection.find_one({"id": media_item["id"]})
    assert document is not None
    assert document["userId"] == user_id
    assert document["filename"] == media_item["filename"]


@requires_mongodb
def test_delete_all(collection, user_id, media_item, repo):
    """Should delete all documents with the same user_id"""
    other_user_id = "test-other-user-id"
    insert1 = collection.insert_one(media_item | {"id": "id1", "userId": user_id})
    insert2 = collection.insert_one(media_item | {"id": "id2", "userId": other_user_id})
    repo.delete_all()

    assert collection.count_documents({"id": "id1"}) == 0
    assert collection.count_documents({"id": "id2"}) == 1


@requires_mongodb
def test_all__same_user_id(collection, user_id, media_item, repo):
    """Should return all documents with the same user_id ordered by creation time"""
    attr1 = copy.deepcopy(media_item) | {"id": "id1", "userId": user_id}
    attr1["mediaMetadata"]["creationTime"] = "2023-07-26T02:20:47Z"
    attr2 = copy.deepcopy(media_item) | {"id": "id2", "userId": user_id}
    attr2["mediaMetadata"]["creationTime"] = "2023-07-25T02:20:47Z"
    insert1 = collection.insert_one(attr1)
    insert2 = collection.insert_one(attr2)
    documents = repo.all()

    ids = [doc["id"] for doc in documents]
    print(documents)
    assert ids == ["id2", "id1"]


@requires_mongodb
def test_all__different_user_id(collection, user_id, media_item, repo):
    """Should not return documents from another user"""
    insert1 = collection.insert_one(media_item | {"id": "id1", "userId": user_id})
    insert2 = collection.insert_one(
        media_item | {"id": "id2", "userId": "test-other-user-id"}
    )

    documents = repo.all()

    ids = [doc["id"] for doc in documents]
    assert "id2" not in ids


@requires_mongodb
def test_count__same_user_id(collection, user_id, media_item, repo):
    """Should count all documents with the same user_id"""
    insert1 = collection.insert_one(media_item | {"id": "id1", "userId": user_id})
    insert2 = collection.insert_one(
        media_item | {"id": "id2", "userId": "test-other-user-id"}
    )

    count = repo.count()

    assert count == 1
