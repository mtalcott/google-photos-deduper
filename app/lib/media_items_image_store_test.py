import os
import shutil
from unittest.mock import DEFAULT
import pytest
import requests
from app.lib.media_items_image_store import MediaItemsImageStore


# TODO: Use remote image URLs only when INTEGRATION_TEST env is true
remote_images_folder_path = (
    "https://google-photos-deduper-public.s3.amazonaws.com/test_images"
)
image_url = f"{remote_images_folder_path}/test-image-2.jpg?test"

local_images_folder_path = "app/test/images"
local_image_path = f"{local_images_folder_path}/test-image-2.jpg"


@pytest.fixture
def image_store():
    return MediaItemsImageStore()


@pytest.fixture
def storable_media_item(media_item):
    return media_item | {"id": "image1", "baseUrl": image_url}


expected_path = "/tmp/image1-250.jpg"


@pytest.fixture(autouse=True)
def run_before_and_after_tests():
    """Fixture to execute asserts before and after a test is run"""
    if os.path.isfile(expected_path):
        os.remove(expected_path)
    yield


def test_store_image(storable_media_item, image_store):
    """It should download the image using the baseUrl and return the storage filename."""
    result = image_store.store_image(storable_media_item)

    # It should return the storage filename
    assert result == f"{storable_media_item['id']}-250.jpg"
    # It should download the image
    assert os.path.isfile(expected_path)
    with open(expected_path, "rb") as downloaded_file:
        downloaded_file_content = downloaded_file.read()
        with open(local_image_path, "rb") as expected_file:
            expected_file_content = expected_file.read()
            assert downloaded_file_content == expected_file_content


def test_store_image__file_exists(mocker, storable_media_item, image_store):
    """If the file already exists, it should not download it again."""
    shutil.copyfile(local_image_path, expected_path)
    p = mocker.patch.object(requests, "get")

    image_store.store_image(storable_media_item)

    p.assert_not_called()


def test_store_image__handled_request_exceptions(
    mocker, storable_media_item, image_store
):
    """It should retry up to 3 times if it receives a request exception."""
    p = mocker.patch.object(requests, "get")
    mock_429_response = requests.models.Response()
    mock_429_response.status_code = 429
    timeout_error = requests.exceptions.Timeout()
    mock_successful_response = requests.models.Response()
    mock_successful_response.status_code = 200
    mock_successful_response._content = b"test"
    p.side_effect = [mock_429_response, timeout_error, mock_successful_response]

    result = image_store.store_image(storable_media_item)

    # It should return the storage filename
    assert result == f"{storable_media_item['id']}-250.jpg"
    # It should download the image
    assert os.path.isfile(expected_path)
    with open(expected_path, "rb") as downloaded_file:
        assert downloaded_file.read() == b"test"


def test_store_image__raised_request_exceptions(
    mocker, storable_media_item, image_store
):
    """It should raise the error if a 4th exception is received"""
    p = mocker.patch.object(requests, "get")
    mock_429_response = requests.models.Response()
    mock_429_response.status_code = 429
    timeout_error = requests.exceptions.Timeout()
    p.side_effect = [timeout_error, timeout_error, mock_429_response]

    with pytest.raises(requests.exceptions.HTTPError) as error:
        image_store.store_image(storable_media_item)
        assert error == mock_429_response


def test_get_storage_path(mocker, storable_media_item, image_store):
    """It should return the correct storage path for a given storage filename"""
    result = image_store.get_storage_path("test.jpg")

    assert result == "/tmp/test.jpg"
