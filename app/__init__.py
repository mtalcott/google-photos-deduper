from flask import Flask
from celery import Celery, Task
import flask_cors
from app import config
from app.models.media_items_repository import MediaItemsRepository


# Flask app setup
def create_flask_app() -> Flask:
    flask_app = Flask(config.APP_NAME)
    flask_app.config.from_prefixed_env()
    flask_cors.CORS(flask_app, origins=[config.CLIENT_HOST])

    celery_init_app(flask_app)

    return flask_app


# Celery app setup
# See https://flask.palletsprojects.com/en/2.3.x/patterns/celery/
def celery_init_app(flask_app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args: object, **kwargs: object) -> object:
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery_app = Celery(
        flask_app.name,
        task_cls=FlaskTask,
        broker=f"redis://{config.REDIS_HOST}",
        result_backend=f"redis://{config.REDIS_HOST}",
    )

    celery_app.set_default()
    flask_app.extensions["celery"] = celery_app

    return celery_app


FLASK_APP = create_flask_app()
CELERY_APP = FLASK_APP.extensions["celery"]

MediaItemsRepository.create_indexes()
