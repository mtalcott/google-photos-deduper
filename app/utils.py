from typing import Callable, Optional
import flask
import google_auth_oauthlib.flow
import google.oauth2.credentials
import google.auth.transport.requests
import requests
from app import config
from app.lib.google_api_client import GoogleApiClient


# Generate URL for request to Google's OAuth 2.0 server.
# Use kwargs to set optional request parameters.
def get_authorization_url() -> "tuple[str, str]":
    flow = __get_oauth_flow()
    authorization_url, state = flow.authorization_url(
        # Enable offline access so that you can refresh an access token without
        # re-prompting the user for permission. Recommended for web server apps.
        access_type="offline",
        # Enable incremental authorization. Recommended as a best practice.
        include_granted_scopes="true",
        prompt="consent",
    )

    return authorization_url, state


def get_credentials(state: str, authorization_response: dict) -> str:
    flow = __get_oauth_flow(state)
    flow.fetch_token(authorization_response=authorization_response)
    return flow.credentials


def refresh_session_credentials_if_invalid():
    if "credentials" not in flask.session:
        return

    client = GoogleApiClient(flask.session["credentials"])

    if not client.are_credentials_valid():
        client.refresh_credentials()
        flask.session["credentials"] = client.credentials_as_dict()


def __get_oauth_flow(state: str = None) -> google_auth_oauthlib.flow.Flow:
    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        {
            "web": {
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "auth_uri": config.GOOGLE_AUTH_URI,
                "token_uri": config.GOOGLE_TOKEN_URI,
            }
        },
        scopes=[
            "openid",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/photoslibrary",  # Access to both the photoslibrary.appendonly and photoslibrary.readonly scopes. Doesn't include photoslibrary.sharing or photoslibrary.edit access.
        ],
        state=state,
    )

    # Indicate where the API server will redirect the user after the user completes
    # the authorization flow. The redirect URI is required. The value must exactly
    # match one of the authorized redirect URIs for the OAuth 2.0 client, which you
    # configured in the API Console. If this value doesn't match an authorized URI,
    # you will get a 'redirect_uri_mismatch' error.
    flow.redirect_uri = flask.url_for("callback", _external=True)

    return flow


def credentials_to_dict(credentials: google.oauth2.credentials.Credentials) -> dict:
    return GoogleApiClient.credentials_to_dict(credentials)


def refresh_credentials_if_invalid(
    credentials: dict,
    func: Callable[[dict], None],
    set_credentials: Optional[Callable[[dict], None]] = None,
) -> tuple[bool, dict]:
    """
    Call `func` with the given credentials, refreshing them and retrying if
    they are invalid.

    @param credentials: A dict containing credentials (see
        GoogleApiClient.credentials_to_dict)
    @param set_credentials: A function or lambda to call to store the refreshed
        credentials, if changed

    @return A tuple containing a boolean indicating whether the credentials
        were refreshed, and the credentials dict (refreshed if needed)
    """
    # Would use `with` keyword and @contextmanager, but unfortunately it does
    #   not support multiple yields: https://stackoverflow.com/a/16919782/379231
    try:
        func(credentials)
        return (False, credentials)
    except requests.exceptions.HTTPError as error:
        if error.response.status_code == 401:
            client = GoogleApiClient(credentials)
            refreshed_credentials = client.refresh_credentials()
            func(refreshed_credentials)
            if set_credentials:
                set_credentials(refreshed_credentials)
            return (True, refreshed_credentials)
        else:
            raise error
