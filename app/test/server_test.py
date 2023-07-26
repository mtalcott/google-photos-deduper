import pytest
import flask
from app import create_flask_app, FLASK_APP
from app import server
from app.lib.google_api_client import GoogleApiClient


@pytest.fixture(scope="session")
def flask_app():
    app = FLASK_APP
    app.config.update(
        {
            "TESTING": True,
        }
    )

    yield app


@pytest.fixture()
def client(flask_app):
    return flask_app.test_client()


@pytest.fixture()
def runner(flask_app):
    return flask_app.test_cli_runner()


class TestAuthMe:
    def test_auth_me_no_session_credentials(self, client):
        response = client.get("/auth/me")
        assert response.status_code == 401
        assert response.json["logged_in"] is False

    @pytest.mark.skip
    def test_auth_me_invalid_session_credentials(self, client, credentials):
        # TODO: test that invalid credentials are refreshed
        with client.session_transaction() as session:
            session["credentials"] = credentials
        response = client.get("/auth/me")
        assert response.status_code == 401
        assert response.json["logged_in"] is False

    def test_auth_me_valid_session_credentials(self, client, credentials, mocker):
        with client.session_transaction() as session:
            session["credentials"] = credentials

        patcher = mocker.patch.object(GoogleApiClient, "get_user_info")
        patcher.return_value = user_info = {"id": "test-user-id"}

        response = client.get("/auth/me")
        assert response.status_code == 200
        assert response.json["logged_in"] is True
        assert response.json["user_info"] == user_info
