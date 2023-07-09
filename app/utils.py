import google_auth_oauthlib.flow
import flask
from . import config

# Generate URL for request to Google's OAuth 2.0 server.
# Use kwargs to set optional request parameters.
def get_authorization_url() -> "tuple[str, str]":
    flow = __get_oauth_flow()
    authorization_url, state = flow.authorization_url(
        # Enable offline access so that you can refresh an access token without
        # re-prompting the user for permission. Recommended for web server apps.
        access_type='offline',
        # Enable incremental authorization. Recommended as a best practice.
        include_granted_scopes='true',
        prompt='consent')
    
    return authorization_url, state

def get_credentials(state: str, authorization_response: dict) -> str:
    flow = __get_oauth_flow(state)
    flow.fetch_token(authorization_response=authorization_response)
    return flow.credentials

def get_authorized_session(credentials):
    flow = __get_oauth_flow()
    flow.credentials = credentials
    return flow.authorized_session()

def __get_oauth_flow(state: str=None) -> google_auth_oauthlib.flow.Flow:
    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        {
            "web": {
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "auth_uri": config.GOOGLE_AUTH_URI,
                "token_uri": config.GOOGLE_TOKEN_URI
            }
        },
        scopes=[
            'openid',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/photoslibrary' # Access to both the photoslibrary.appendonly and photoslibrary.readonly scopes. Doesn't include photoslibrary.sharing or photoslibrary.edit access.
        ],
        state=state)
    
    # Indicate where the API server will redirect the user after the user completes
    # the authorization flow. The redirect URI is required. The value must exactly
    # match one of the authorized redirect URIs for the OAuth 2.0 client, which you
    # configured in the API Console. If this value doesn't match an authorized URI,
    # you will get a 'redirect_uri_mismatch' error.
    flow.redirect_uri = flask.url_for('callback', _external=True)

    return flow
