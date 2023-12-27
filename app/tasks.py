import logging, logging.handlers
import os
import celery
from celery.signals import after_task_publish, after_setup_logger
from typing import Callable, Optional
from app import CELERY_APP as celery_app
from app.config import CELERY_WORKER_LOG_PATH

from app.lib.process_duplicates_task import ProcessDuplicatesTask
from app.lib.store_images_task import StoreImagesTask
from app.models.media_items_repository import MediaItemsRepository


class TaskUpdaterLogHandler(logging.Handler):
    """
    Custom logging handler that updates celery task meta
    """

    def __init__(self):
        super().__init__()
        self.handler = None

    def set_handler(self, handler: Callable[[str], None]):
        self.handler = handler

    def emit(self, record):
        if self.handler:
            self.handler(record.getMessage())


task_updater_log_handler = TaskUpdaterLogHandler()

# Update celery task meta with logs from task logger
task_logger = celery.utils.log.get_task_logger(__name__)
task_logger.addHandler(task_updater_log_handler)


# TODO: Can't get this to work, so setting up with a global flag when the task runs instead :(
#       By the time the task runs, the handler no longer appears to be registered
# Note: after_setup_logger and  signals are called BEFORE
#       stdout is redirected, so we need to listen to a later
# @celery.signals.worker_ready.connect
# def setup_stdout_handler(**kwargs):
#     """
#     Sets up logging handlers to update task metadata on stdout output, so
#     we can pass along progress from the tdqm progress bars from
#     sentence_transformers and our DuplicateImageDetector.
#     """
#     print(f"setup_stdout_handler, kwargs: {kwargs}")
#     # Update celery task meta with logs from redirected output (e.g. print statements)
#     logging.getLogger("celery.redirected").addHandler(task_updater_log_handler)

is_stdout_handler_setup = False

# import torch

# torch.set_num_threads(1)


# Save worker logs to rotated log files
@after_setup_logger.connect
def on_after_setup_logger(
    logger,
    loglevel,
    format,
    **kwargs,
):
    log_file_handler = logging.handlers.RotatingFileHandler(
        CELERY_WORKER_LOG_PATH,
        maxBytes=10_000_000,  # 10 MB
        backupCount=5,
    )
    log_file_handler.setLevel(logging.INFO)
    log_file_formatter = logging.Formatter(format)
    log_file_handler.setFormatter(log_file_formatter)
    logger.addHandler(log_file_handler)


# https://stackoverflow.com/a/10089358
@after_task_publish.connect
def update_sent_state(sender=None, headers=None, **kwargs):
    # the task may not exist if sent using `send_task` which
    # sends tasks by name, so fall back to the default result backend
    # if that is the case.
    task = celery_app.tasks.get(sender)
    backend = task.backend if task else celery_app.backend

    backend.store_result(headers["id"], None, "SENT")


@celery.shared_task(bind=True)
def process_duplicates(self: celery.Task, *args, **kwargs):
    global is_stdout_handler_setup
    if not is_stdout_handler_setup:
        logging.getLogger("celery.redirected").addHandler(task_updater_log_handler)
        is_stdout_handler_setup = True

    task_logger = celery.utils.log.get_task_logger(__name__)

    task_instance = ProcessDuplicatesTask(
        self,
        logger=task_logger,
        *args,
        **kwargs,
    )

    def set_task_meta_log_message(message):
        task_instance.update_meta(log_message=message)

    task_updater_log_handler.set_handler(set_task_meta_log_message)
    results = task_instance.run()
    # Celery replaces the `info` field with the return value of the task, so
    #   return the last meta update alongside our results
    final_meta = task_instance.get_meta()

    return {
        "results": results,
        "meta": final_meta,
    }


@celery.shared_task
def store_images(
    user_id: str,
    media_item_ids: list[str],
    resolution: Optional[int] = None,
):
    # TODO: Fix this workaround
    task_updater_log_handler.set_handler(lambda x: None)
    task_instance = StoreImagesTask(
        user_id,
        media_item_ids,
        resolution,
        logger=task_logger,
    )
    task_instance.run()
