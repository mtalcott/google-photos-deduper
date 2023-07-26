import pytest
import app.tasks
import app.config
import requests
import mongomock
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_api_client import GoogleApiClient
from app.models.media_items_repository import MediaItemsRepository


@pytest.fixture
def credentials():
    return {
        "token": "TOKEN",
        "refresh_token": "REFRESH_TOKEN",
        "token_uri": "TOKEN_URI",
        "client_id": "CLIENT_ID",
        "client_secret": "CLIENT_SECRET",
        "scopes": ["SCOPE"],
    }


# @mongomock.patch(servers="mongodb://mongotest:27017/")
@pytest.mark.skip  # TODO: Make mongomock work and get MediaItemsRepository mock working
@mongomock.patch(servers=(("mongotest", 27017),))
def test_process_duplicates(mocker, celery_app, celery_worker, credentials):
    print(f"app.config.MONGODB_URI: {app.config.MONGODB_URI}")
    print(f"app.config.DATABASE: {app.config.DATABASE}")

    patcher = mocker.patch.object(GoogleApiClient, "get_user_info")
    patcher.return_value = {"id": "test-user-id"}

    # config = {
    #     "count.return_value": 0,
    #     "delete_all.return_value": None,
    # }
    patcher2 = mocker.patch(
        "app.models.media_items_repository.MediaItemsRepository",
        count=0,
        delete_all=None,
    )

    result = app.tasks.process_duplicates.delay(
        credentials=credentials,
        refresh_media_items=True,
    )
    assert result.get() == {"groups": []}
