import flask
import celery
from . import config

# Flask app setup
APP = app = flask.Flask(config.APP_NAME)
app.config.from_prefixed_env()

# Celery app setup
# See https://flask.palletsprojects.com/en/2.3.x/patterns/celery/
class FlaskTask(celery.Task):
    def __call__(self, *args: object, **kwargs: object) -> object:
        with app.app_context():
            return self.run(*args, **kwargs)

CELERY_APP = celery_app = celery.Celery(
    app.name,
    task_cls=FlaskTask,
    broker=f"redis://{config.REDIS_HOST}",
    result_backend=f"redis://{config.REDIS_HOST}")

celery_app.set_default()
app.extensions["celery"] = celery_app