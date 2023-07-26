import pytest
from app.lib.google_api_client import GoogleApiClient
from app.utils import refresh_credentials_if_invalid
from unittest.mock import Mock
import requests


class TestRefreshCredentialsIfInvalid:
    def test_refresh_credentials_if_invalid__valid_credentials__no_setter(
        self, credentials
    ):
        func = Mock()

        refreshed, returned_credentials = refresh_credentials_if_invalid(
            credentials, func
        )

        func.assert_called_once_with(credentials)
        assert refreshed is False
        assert returned_credentials == credentials

    def test_refresh_credentials_if_invalid__valid_credentials__with_setter(
        self, credentials
    ):
        func = Mock()
        set_credentials = Mock()

        refreshed, returned_credentials = refresh_credentials_if_invalid(
            credentials, func, set_credentials=set_credentials
        )

        func.assert_called_once_with(credentials)
        assert refreshed is False
        assert returned_credentials == credentials
        set_credentials.assert_not_called()

    def test_refresh_credentials_if_invalid__invalid_credentials__no_setter(
        self, credentials, mocker
    ):
        func = Mock()
        new_credentials = credentials | {"token": "NEW_TOKEN"}

        mock_response = Mock(spec=requests.Response, status_code=401)
        error = requests.exceptions.HTTPError(response=mock_response)
        assert error.response.status_code == 401

        # First call raises unauthorized error, second call succeeds
        func = Mock(side_effect=[error, None])
        mocker.patch.multiple(
            "app.lib.google_api_client.GoogleApiClient",
            refresh_credentials=Mock(return_value=new_credentials),
        )

        refreshed, returned_credentials = refresh_credentials_if_invalid(
            credentials, func
        )

        func.assert_has_calls(
            [
                mocker.call(credentials),
                mocker.call(new_credentials),
            ]
        )
        assert refreshed is True
        assert returned_credentials == new_credentials

    def test_refresh_credentials_if_invalid__invalid_credentials__with_setter(
        self, credentials, mocker
    ):
        func = Mock()
        new_credentials = credentials | {"token": "NEW_TOKEN"}
        set_credentials = Mock()

        mock_response = Mock(spec=requests.Response, status_code=401)
        error = requests.exceptions.HTTPError(response=mock_response)
        assert error.response.status_code == 401

        # First call raises unauthorized error, second call succeeds
        func = Mock(side_effect=[error, None])
        mocker.patch.multiple(
            "app.lib.google_api_client.GoogleApiClient",
            refresh_credentials=Mock(return_value=new_credentials),
        )

        refresh_credentials_if_invalid(
            credentials, func, set_credentials=set_credentials
        )

        set_credentials.assert_called_once_with(new_credentials)
