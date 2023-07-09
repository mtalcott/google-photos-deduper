import celery
import celery.utils.log
import google_photos_deduper.google_photos.client
from . import utils
from . import server # required for building URLs
from . import CELERY_APP as celery_app

logger = celery.utils.log.get_logger(__name__)

@celery.shared_task(bind=True)
def process_duplicates(self: celery.Task, credentials: dict, refresh_media_items: bool = False):
    client = google_photos_deduper.google_photos.client.Client(credentials)

    # self.update_state(state="PROGRESS", meta={"current": i + 1, "total": total})

    if refresh_media_items or client.local_media_items_count() == 0:
        client.retrieve_media_items()

    client.process_duplicates()
