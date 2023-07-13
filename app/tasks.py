import celery
import celery.utils.log
import app.lib.google_photos_client
from app import utils
from app import server  # required for building URLs
from app import CELERY_APP as celery_app

logger = celery.utils.log.get_logger(__name__)


@celery.shared_task(bind=True)
def process_duplicates(
    self: celery.Task, credentials: dict, refresh_media_items: bool = False
):
    client = app.lib.google_photos_client.GooglePhotosClient(credentials)

    # self.update_state(state="PROGRESS", meta={"current": i + 1, "total": total})

    if refresh_media_items or client.local_media_items_count() == 0:
        client.retrieve_media_items()

    return client.process_duplicates()
