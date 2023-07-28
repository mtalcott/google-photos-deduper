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
    def test_auth_me_no__session_user_id(self, client):
        response = client.get("/auth/me")
        assert response.status_code == 401
        assert response.json["logged_in"] is False

    def test_auth_me__session_user_id(
        self,
        client,
        credentials,
        user_info,
        mocker,
    ):
        mocker.patch.multiple(
            "app.models.credentials_repository.CredentialsRepository",
            get=Mock(return_value=credentials),
        )
        mocker.patch.multiple(
            "app.lib.google_api_client.GoogleApiClient",
            get_user_info=Mock(return_value=user_info),
        )

        with client.session_transaction() as session:
            session["user_id"] = user_info["id"]

        with client:
            response = client.get("/auth/me")
            assert response.status_code == 200
            assert response.json["logged_in"] is True
            assert response.json["user_info"] == user_info
