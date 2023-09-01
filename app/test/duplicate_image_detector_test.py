import pytest
from app.lib.duplicate_image_detector import DuplicateImageDetector
from app.lib.google_api_client import GoogleApiClient
from app.lib.media_items_image_store import MediaItemsImageStore

local_images_folder_path = "app/test/images"


@pytest.fixture
def media_items(media_item):
    return [
        media_item | {"id": "image1", "storageFilename": "test-image-dup-1a.jpg"},
        media_item | {"id": "image2", "storageFilename": "test-image-dup-1b.jpg"},
        media_item | {"id": "image3", "storageFilename": "test-image-2.jpg"},
    ]


@pytest.fixture
def test_image_paths():
    return [
        f"{local_images_folder_path}/test-image-dup-1a.jpg",
        f"{local_images_folder_path}/test-image-dup-1b.jpg",
        f"{local_images_folder_path}/test-image-2.jpg",
    ]


def test_calculate_groups(mocker, media_items, test_image_paths):
    p1 = mocker.patch.object(GoogleApiClient, "get_user_info")
    p1.return_value = {"id": "test-user-id"}

    p2 = mocker.patch.object(MediaItemsImageStore, "get_storage_path")
    p2.side_effect = test_image_paths  # Return first, then second, then third

    detector = DuplicateImageDetector(media_items)
    groups = detector.calculate_groups()

    assert groups == [[0, 1]]


def test_calculate_similarity_map(mocker, media_items, test_image_paths):
    p1 = mocker.patch.object(GoogleApiClient, "get_user_info")
    p1.return_value = {"id": "test-user-id"}

    p2 = mocker.patch.object(MediaItemsImageStore, "get_storage_path")
    p2.side_effect = test_image_paths  # Return first, then second, then third

    detector = DuplicateImageDetector(media_items)
    similarity_map = detector.calculate_similarity_map()

    assert type(similarity_map) == dict
    assert len(similarity_map) == 2
    assert similarity_map["image1"]["image2"] >= 0.999999
    assert similarity_map["image2"]["image1"] >= 0.999999
