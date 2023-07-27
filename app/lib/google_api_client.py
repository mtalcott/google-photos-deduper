import copy
import logging
from typing import Callable
import google.oauth2.credentials
import google.auth.transport.requests
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.models.credentials_repository import CredentialsRepository
from app import config

# With user_id
# - Get credentials from store

# Without user_id
# Must have some credentials.
# Fetch user_id from Google


class GoogleApiClient:
    @classmethod
    def from_user_id(cls, user_id: str, *args, **kwargs):
        credentials_repo = CredentialsRepository(user_id)
        credentials = credentials_repo.get()
        if not credentials:
            raise ValueError(f"No credentials found for user_id: {user_id}")

        return cls(credentials, *args, **kwargs | {"user_id": user_id})

    @classmethod
    def credentials_to_dict(
        cls, credentials: google.oauth2.credentials.Credentials
    ) -> dict:
        """
        Convert a google.oauth2.credentials.Credentials object to a dict
        """
        return {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "scopes": credentials.scopes,
        }

    def __init__(
        self,
        credentials: dict,
        user_id: str = None,
        logger=logging.getLogger(),
    ):
        full_credentials = self._get_full_credentials(credentials)

        self.credentials_obj = google.oauth2.credentials.Credentials(**full_credentials)
        session = google.auth.transport.requests.AuthorizedSession(self.credentials_obj)

        self.__configure_requests_session(session)
        self.session = session

        self.user_id = user_id
        self.credentials_repo = None  # Intialize upon save, if necessary

        self.logger = logger

    def are_credentials_valid(self) -> bool:
        # Initializing a client with invalid credentials raises an error
        try:
            self.get_user_info()
        except requests.exceptions.HTTPError as error:
            if error.response.status_code != 401:
                raise error

            return False

        return True

    def refresh_credentials(self) -> dict:
        request = google.auth.transport.requests.Request()
        self.credentials_obj.refresh(request)
        return self.credentials_as_dict()

    def credentials_as_dict(self) -> dict:
        return self.__class__.credentials_to_dict(self.credentials_obj)

    def get_user_info(self):
        def func():
            user_info = self.session.get(
                "https://www.googleapis.com/userinfo/v2/me"
            ).json()
            self.user_id = user_info["id"]
            return user_info

        return self._refresh_credentials_if_invalid(func)

    def get_user_id(self):
        if not self.user_id:
            self.get_user_info()
        return self.user_id

    def _get_full_credentials(self, credentials: dict):
        """
        Return a full credentials dict with all required keys, including sensitive
        ones we don't want stored in our database such as `client_secret`.
        """
        return copy.deepcopy(credentials) | {
            "client_id": config.GOOGLE_CLIENT_ID,
            "client_secret": config.GOOGLE_CLIENT_SECRET,
            "token_uri": config.GOOGLE_TOKEN_URI,
        }

    # TODO: Make this a decorator or move into a requests session hook
    def _refresh_credentials_if_invalid(
        self,
        func: Callable[[], None],
    ) -> bool:
        """
        Call `func`; if a 401 response is raised, refresh and store credentials,
        then try again.

        @param func:  A function or lambda to call

        @return return value of func()
        """
        # Would use `with` keyword and @contextmanager, but unfortunately it does
        #   not support multiple yields: https://stackoverflow.com/a/16919782/379231
        try:
            return func()
        except requests.exceptions.HTTPError as error:
            if error.response.status_code == 401:
                self.refresh_credentials()
                self.save_credentials()
                return func()
            else:
                raise error

    def save_credentials(self):
        credentials_as_dict = self.credentials_as_dict()
        if not self.credentials_repo:
            self.credentials_repo = CredentialsRepository(self.get_user_id())
        self.credentials_repo.set(credentials_as_dict)

    def __configure_requests_session(self, session):
        # Automatically raise errors
        session.hooks = {"response": lambda r, *args, **kwargs: r.raise_for_status()}

        # Retry up to 3 times on 503 response
        retry_strategy = Retry(total=3, backoff_factor=1, status_forcelist=[503])
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
