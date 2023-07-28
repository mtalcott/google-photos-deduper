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
        media_item | {"id": "image1"},
        media_item | {"id": "image2"},
        media_item | {"id": "image3"},
    ]


@pytest.fixture
def test_images():
    return [
        Image.open(f"{local_images_folder_path}/test-image-dup-1a.jpg"),
        Image.open(f"{local_images_folder_path}/test-image-dup-1b.jpg"),
        Image.open(f"{local_images_folder_path}/test-image-2.jpg"),
    ]


def test_calculate_clusters(mocker, media_items, test_images):
    p1 = mocker.patch.object(GoogleApiClient, "get_user_info")
    p1.return_value = {"id": "test-user-id"}

    p2 = mocker.patch.object(MediaItemsImageStore, "get_image")
    p2.side_effect = test_images  # Return first, then second, then third

    detector = DuplicateImageDetector(media_items)
    clusters = detector.calculate_clusters()

    assert clusters == [[0, 1]]


def test_calculate_similarity_map(mocker, media_items, test_images):
    p1 = mocker.patch.object(GoogleApiClient, "get_user_info")
    p1.return_value = {"id": "test-user-id"}

    p2 = mocker.patch.object(MediaItemsImageStore, "get_image")
    p2.side_effect = test_images  # Return first, then second, then third

    detector = DuplicateImageDetector(media_items)
    similarity_map = detector.calculate_similarity_map()

    assert type(similarity_map) == dict
    assert len(similarity_map) == 2
    assert similarity_map["image1"]["image2"] == 1.0
    assert similarity_map["image2"]["image1"] == 1.0
