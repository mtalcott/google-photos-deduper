import pytest
from unittest.mock import Mock
import requests


class TestRefreshCredentialsIfInvalid:
    @pytest.mark.skip(reason="TODO private method now, test behavior in other methods")
    def test_refresh_credentials_if_invalid__valid_credentials(self, credentials):
        func = Mock()

        # TODO: Test retry on 401
        # mock_response = Mock(spec=requests.Response, status_code=401)
        # error = requests.exceptions.HTTPError(response=mock_response)
        # assert error.response.status_code == 401

        # mocker.patch.multiple(
        #     "app.lib.google_api_client.GoogleApiClient",
        #     # First call raises unauthorized error, second call succeeds
        #     get_user_info=Mock(side_effect=[error, user_info]),
        #     refresh_credentials=Mock(return_value=new_credentials),
        # )

        refreshed, returned_credentials = refresh_credentials_if_invalid(
            credentials, func
        )

        func.assert_called_once_with(credentials)
        assert refreshed is False
        assert returned_credentials == credentials

    @pytest.mark.skip(reason="TODO private method now, test behavior in other methods")
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

    @pytest.mark.skip(reason="TODO private method now, test behavior in other methods")
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

    @pytest.mark.skip(reason="TODO private method now, test behavior in other methods")
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
