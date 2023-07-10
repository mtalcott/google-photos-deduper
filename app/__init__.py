import flask
import celery
from app import config

# Flask app setup
FLASK_APP = flask_app = flask.Flask(config.APP_NAME)
flask_app.config.from_prefixed_env()


# Celery app setup
# See https://flask.palletsprojects.com/en/2.3.x/patterns/celery/
class FlaskTask(celery.Task):
    def __call__(self, *args: object, **kwargs: object) -> object:
        with flask_app.app_context():
            return self.run(*args, **kwargs)


CELERY_APP = celery_app = celery.Celery(
    flask_app.name,
    task_cls=FlaskTask,
    broker=f"redis://{config.REDIS_HOST}",
    result_backend=f"redis://{config.REDIS_HOST}",
)

celery_app.set_default()
flask_app.extensions["celery"] = celery_app
