# Python standard libraries
import json
import os
import requests

# Third party libraries
import dotenv
import flask
import google_auth_oauthlib.flow

# By default .env will be loaded
dotenv.load_dotenv()

# Configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

# Flask app setup
app = flask.Flask(__name__)
app.config.from_prefixed_env()

@app.route("/")
def index():
    return "<a href=\"/start\">Get started!</a>"

@app.route("/start")
def start():
    flow = __get_flow()

    # Generate URL for request to Google's OAuth 2.0 server.
    # Use kwargs to set optional request parameters.
    authorization_url, state = flow.authorization_url(
        # Enable offline access so that you can refresh an access token without
        # re-prompting the user for permission. Recommended for web server apps.
        access_type='offline',
        # Enable incremental authorization. Recommended as a best practice.
        include_granted_scopes='true',
        prompt='consent')

    flask.session['state'] = state

    # Redirect the user to the authorization URL.
    return flask.redirect(authorization_url)

@app.route("/auth/google/callback")
def callback():
    state = flask.session['state']
    flow = __get_flow(state=state)
    flow.fetch_token(authorization_response=flask.request.url)

    # Store the credentials in the session.
    # TODO: Store in database
    credentials = flow.credentials
    flask.session['credentials'] = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes}

    return f"<p>Alrighty then.</p>"

def __get_flow(state=None):
    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": GOOGLE_AUTH_URI,
                "token_uri": GOOGLE_TOKEN_URI
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

if __name__ == "__main__":
    app.run()