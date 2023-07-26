from unittest.mock import Mock
import pytest
import flask
import requests
from app import server
from app.lib.google_api_client import GoogleApiClient


@pytest.fixture()
def client(flask_app):
    return flask_app.test_client()


class TestAuthMe:
    def test_auth_me_no_session_credentials(self, client):
        response = client.get("/auth/me")
        assert response.status_code == 401
        assert response.json["logged_in"] is False

    def test_auth_me_invalid_session_credentials(
        self, client, credentials, user_info, mocker
    ):
        new_credentials = credentials | {"token": "NEW_TOKEN"}

        mock_response = Mock(spec=requests.Response, status_code=401)
        error = requests.exceptions.HTTPError(response=mock_response)
        assert error.response.status_code == 401

        mocker.patch.multiple(
            "app.lib.google_api_client.GoogleApiClient",
            # First call raises unauthorized error, second call succeeds
            get_user_info=Mock(side_effect=[error, user_info]),
            refresh_credentials=Mock(return_value=new_credentials),
        )

        with client.session_transaction() as session:
            session["credentials"] = credentials

        with client:
            response = client.get("/auth/me")
            assert response.status_code == 200
            assert response.json["logged_in"] is True
            assert response.json["user_info"] == user_info
            assert flask.session["credentials"] == new_credentials

    def test_auth_me_valid_session_credentials(
        self, client, credentials, user_info, mocker
    ):
        patcher = mocker.patch.object(GoogleApiClient, "get_user_info")
        patcher.return_value = user_info

        with client.session_transaction() as session:
            session["credentials"] = credentials

        with client:
            response = client.get("/auth/me")
            patcher.assert_called_once()
            assert response.status_code == 200
            assert response.json["logged_in"] is True
            assert response.json["user_info"] == user_info
            assert flask.session["credentials"] == credentials
