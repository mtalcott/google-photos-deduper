import pytest
import requests
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_api_client import GoogleApiClient


# TODO: Use remote image URLs only when INTEGRATION_TEST env is true
folder_path = "https://mack-public.s3.amazonaws.com/google_photos_deduper/test_images"
# folder_path = "app/test"
duplicate_images = [
    f"{folder_path}/test-image-dup-1a.jpg?test",
    f"{folder_path}/test-image-dup-1b.jpg?test",
]
other_image = f"{folder_path}/test-image-2.jpg?test"


@pytest.fixture
def media_items(media_item):
    return [
        media_item | {"baseUrl": duplicate_images[0]},
        media_item | {"baseUrl": duplicate_images[1]},
        media_item | {"baseUrl": other_image},
    ]


def test_calculate_clusters(mocker, media_items):
    patcher = mocker.patch.object(GoogleApiClient, "get_user_info")
    patcher.return_value = {"id": "test-user-id"}

    detector = DuplicateImageDetector()
    results = detector.calculate_clusters(media_items)

    assert results == [[0, 1]]
