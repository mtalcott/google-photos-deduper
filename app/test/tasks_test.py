import pytest
import app.tasks
import app.config
import requests
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_api_client import GoogleApiClient
from app.models.media_items_repository import MediaItemsRepository
from unittest.mock import Mock


def test_process_duplicates(
    mocker,
    celery_app,
    celery_worker,  # Starts a celery worker in a separate thread
    credentials,
    user_info,
    media_item,
):
    mocker.patch.multiple(
        "app.models.credentials_repository.CredentialsRepository",
        get=Mock(return_value=credentials),
    )
    media_item = media_item | {"size": 100}
    mocker.patch.multiple(
        "app.lib.google_photos_client.GooglePhotosClient",
        get_user_info=Mock(return_value=user_info),
        local_media_items_count=Mock(return_value=0),
        fetch_media_items=Mock(return_value=None),
        get_local_media_items=Mock(return_value=[media_item]),
    )
    mocker.patch.multiple(
        "app.lib.duplicate_image_detector.DuplicateImageDetector",
        calculate_groups=Mock(return_value=[[0]]),
        calculate_similarity_map=Mock(return_value={}),
    )

    async_result = app.tasks.process_duplicates.delay(
        user_info["id"],
        refresh_media_items=True,
    )
    result = async_result.get()

    assert "groups" in result["results"]
    assert len(result["results"]["groups"]) == 1
    assert "mediaItemIds" in result["results"]["groups"][0]
    assert len(result["results"]["groups"][0]["mediaItemIds"]) == 1
    assert result["results"]["groups"][0]["mediaItemIds"][0] == media_item["id"]

    assert "similarityMap" in result["results"]
    assert result["results"]["similarityMap"] == {}
