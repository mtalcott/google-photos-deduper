import pytest
import requests
from PIL import Image
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_api_client import GoogleApiClient
from app.lib.media_items_image_store import MediaItemsImageStore


# TODO: Use remote image URLs only when INTEGRATION_TEST env is true
remote_images_folder_path = (
    "https://mack-public.s3.amazonaws.com/google_photos_deduper/test_images"
)
duplicate_image_urls = [
    f"{remote_images_folder_path}/test-image-dup-1a.jpg?test",
    f"{remote_images_folder_path}/test-image-dup-1b.jpg?test",
]
other_image_url = f"{remote_images_folder_path}/test-image-2.jpg?test"

local_images_folder_path = "app/test/images"


@pytest.fixture
def media_items(media_item):
    return [
        media_item | {"baseUrl": duplicate_image_urls[0]},
        media_item | {"baseUrl": duplicate_image_urls[1]},
        media_item | {"baseUrl": other_image_url},
    ]


@pytest.fixture
def test_image():
    return Image.open(f"{local_images_folder_path}/test-image-dup-1a.jpg")


@pytest.mark.slow
def test_calculate_clusters(mocker, media_items, test_image):
    p1 = mocker.patch.object(GoogleApiClient, "get_user_info")
    p1.return_value = {"id": "test-user-id"}

    p2 = mocker.patch.object(MediaItemsImageStore, "get_image")
    p2.return_value = test_image

    detector = DuplicateImageDetector(media_items)
    results = detector.calculate_clusters()

    assert results == [[0, 1]]
