import logging
import celery
import celery.utils.log
import app.lib.google_photos_client
from app import server  # required for building URLs
from app import CELERY_APP as celery_app
from app import config
from flask_socketio import SocketIO

logger = celery.utils.log.get_logger(__name__)


@celery.shared_task(bind=True)
def process_duplicates(
    self: celery.Task, credentials: dict, refresh_media_items: bool = False
):
    socketio = _get_socketio()

    def update_status(m):
        self.update_state(meta={"message": m})
        socketio.emit("task_update", {"message": m})
        logging.info(m)

    update_status("starting now")

    client = app.lib.google_photos_client.GooglePhotosClient(
        credentials, update_status=update_status
    )

    if refresh_media_items or client.local_media_items_count() == 0:
        client.retrieve_media_items()

    return client.process_duplicates()


def _get_socketio():
    return SocketIO(message_queue=f"redis://{config.REDIS_HOST}")
