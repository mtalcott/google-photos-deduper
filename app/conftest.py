import pytest

from app import create_flask_app, FLASK_APP


@pytest.fixture(scope="session")
def flask_app():
    app = FLASK_APP
    app.config.update(
        {
            "TESTING": True,
        }
    )

    yield app


@pytest.fixture(scope="session")
def celery_config():
    # Defaults: https://github.com/celery/celery/blob/5.2/celery/contrib/testing/app.py#L11-L20
    return {
        "broker_url": "memory://",
        "result_backend": "cache+memory://",
    }


@pytest.fixture
def credentials():
    return {
        "token": "TOKEN",
        "refresh_token": "REFRESH_TOKEN",
        "scopes": ["SCOPE"],
    }


@pytest.fixture
def user_id():
    return "test-user-id"


@pytest.fixture
def user_info(user_id):
    return {
        "id": user_id,
    }


@pytest.fixture
def media_item():
    return {
        # "baseUrl": "https://lh3.googleusercontent.com/lr/AJUiC1xWhyltXJ-YvIFjY2oePjh8BSa-LaqZEwTXFtUwUIWubYgxBuK6elu33DtYSkPpuUc1uwHzEolcX2SgV1CXVCvP3LKnwWGeoa_SeIZXBwKy5Y40gdYHFPWLuhiCvhxIVdL7gio_fzKzt8Hpl4QyfESqhf2SBl1AT-0EL_CuIlDYtOsGRfS9rEB30DKXx8gMGx4PQ7wyd_EBvUQ_FkWAsOAQDbS5QjxBBujpKQxC8IyDPgKJdkW9VsIqIs-RejpoWi6tKHZJaK_-iwKyMzEvCEsqbnQ7DT3OqpcNNjZR0jj3eyzPA00a4m2e48hhpzYvlXlKFXjTUX7F8J4yxWNc087ESdtW6I9Ocv0HSUDETPIUlCv01lhDE8eNAn85E3_oVDM1HuFxdHH1jGaxvF85EweWE8vPVeMmfZEKJYLDy6vkPXqWk9EcWnqBPaKzEj25HVdMf7YNe82UlDRQ6lq0Q_c-uCqYy6btUzKuJvW7wEIljPrIO1GmONgNgvk8-qYC07vd44AUZtXhhK5M5AGu_LmEMYtUcSwYwXjl1El3mP_v9EZZTzQEzx9ezBdlavEG8UWequjCvOls3oiyFLOIEbLixHbbN1rxCScPoKZV7_1MmC3_xcQqSpjgWV3vMEFPDRl7ez0Ac6IT8uc_mOsXqZJtXPl751FUWrUEZ1KRWO3G5JVsZtbRuuUjNAk2Q_0sF9WaS685nYQb6zcrS2dcqq5hSGvK1YQ8EaON0dodUEPEcTiP4Tx7o0h1YB8RWNb2yjZV98XZZu-N1vFZOxcmp2wlhThKZ8RvUTdJNFn_ZX4M1bwBMuq_CrEL0MkhXRtAwwfDd79mZbWolhjd0HCza7pChhlHU74X4ulWLu3ZLZ41-_uGQu9GBbrcxFCgmzeZqONYhBqtR87HnkLF6B9_gWTzCrluE_uC6ybwetkNQFtC_3YZA0rsUie70EwNKQDKhk24B8AIzUOTSz3ICmeQkAt3AGLp_0SfsDzWz7rtI0_hRFWeqrL4JRjMjByaiZA",
        "baseUrl": "https://mack-public.s3.amazonaws.com/google_photos_deduper/test_images/test-image-dup-1a.jpg?test",
        "filename": "PXL_20230710_022047570.jpg",
        "id": "AE-vYs7L3AedDPgIeE301REI023URzShGzi4j_XtLBYZwUJ7xbWTqsUBLeP2MxGbKL8s06TdprvhyhQNg9dAHInYwHwB7EOOaA",
        "mediaMetadata": {
            "creationTime": "2023-07-10T02:20:47Z",
            "height": "4032",
            "photo": {
                "apertureFNumber": 1.73,
                "cameraMake": "Google",
                "cameraModel": "Pixel 6a",
                "exposureTime": "0.008337999s",
                "focalLength": 4.38,
                "isoEquivalent": 925,
            },
            "width": "3024",
        },
        "mimeType": "image/jpeg",
        # "productUrl": "https://photos.google.com/lr/photo/AE-vYs7L3AedDPgIeE301REI023URzShGzi4j_XtLBYZwUJ7xbWTqsUBLeP2MxGbKL8s06TdprvhyhQNg9dAHInYwHwB7EOOaA",
        "productUrl": "https://mack-public.s3.amazonaws.com/google_photos_deduper/test_images/test-image-1a.jpg",
    }
