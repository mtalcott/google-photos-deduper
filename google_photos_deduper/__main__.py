import google_photos_deduper.google_photos.client
from google_auth_oauthlib.flow import Flow
import google.oauth2.credentials
from google.auth.transport.requests import AuthorizedSession
import os, logging
import pprint

def run():
    session = None
    access_token = os.environ.get('ACCESS_TOKEN') # Try to get the auth token from ENV
    logging.basicConfig(
        encoding='utf-8',
        format='%(asctime)s %(levelname)-8s %(message)s',
        level=logging.INFO,
        datefmt='%Y-%m-%d %H:%M:%S')
    
    # breakpoint()
    if access_token:
        credentials = google.oauth2.credentials.Credentials(access_token)
        session = AuthorizedSession(credentials)
    else:
        # Create the flow using the client secrets file from the Google API
        # Console.
        flow = Flow.from_client_secrets_file(
            'client_secret_792370018435-b70v71v2e7cb3i3s67cdg74qtfao5a1t.apps.googleusercontent.com.json',
            scopes=[
                'openid',
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/photoslibrary' # Access to both the photoslibrary.appendonly and photoslibrary.readonly scopes. Doesn't include photoslibrary.sharing or photoslibrary.edit access.
            ],
            redirect_uri='urn:ietf:wg:oauth:2.0:oob')

        # Tell the user to go to the authorization URL.
        auth_url, _ = flow.authorization_url(prompt='consent')
        print(f'Please go to this URL: {auth_url}')

        # The user will get an authorization code. This code is used to get the
        # access token.
        auth_code = input('Enter the authorization code: ')
        token = flow.fetch_token(code=auth_code)
        access_token = token['access_token']

        logging.info(f'Auth token (export to ACCESS_TOKEN to bypass auth flow for debugging): {access_token}')

        # You can use flow.credentials, or you can just get a requests session
        # using flow.authorized_session.
        session = flow.authorized_session()

    client = google_photos_deduper.google_photos.client.Client(session)

    local_media_items_count = client.local_media_items_count()
    refresh = True
    if local_media_items_count > 0:
        refresh = input(f"{local_media_items_count:,} local mediaItems found. Do you want to refresh? (Enter \"y\" to refresh) ").startswith('y')
    
    if refresh:
        client.retrieve_media_items()

    client.process_duplicates()


if __name__ == '__main__':
    run()
