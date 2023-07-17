import google.oauth2.credentials
import google.auth.transport.requests
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry


class GoogleApiClient:
    def __init__(self, credentials: dict):
        self.credentials_obj = google.oauth2.credentials.Credentials(**credentials)
        session = google.auth.transport.requests.AuthorizedSession(self.credentials_obj)

        self.__configure_requests_session(session)
        self.session = session

    def are_credentials_valid(self) -> bool:
        # Initializing a client with invalid credentials raises an error
        try:
            self.get_user_info()
        except requests.exceptions.HTTPError as error:
            if error.response.status_code != 401:
                raise error

            return False

        return True

    def refresh_credentials(self) -> None:
        request = google.auth.transport.requests.Request()
        self.credentials_obj.refresh(request)

    def credentials_as_dict(self):
        return self.__class__.credentials_to_dict(self.credentials_obj)

    def get_user_info(self):
        return self.session.get("https://www.googleapis.com/userinfo/v2/me").json()

    def __configure_requests_session(self, session):
        # Automatically raise errors
        session.hooks = {"response": lambda r, *args, **kwargs: r.raise_for_status()}

        # TODO: automatically refresh and retry on 401

        # Retry up to 3 times on 503 response
        retry_strategy = Retry(total=3, backoff_factor=1, status_forcelist=[503])
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)

    @classmethod
    def credentials_to_dict(
        cls, credentials: google.oauth2.credentials.Credentials
    ) -> dict:
        return {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": credentials.scopes,
        }
