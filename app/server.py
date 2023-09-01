import math
import pprint
import urllib.parse
import re
import flask
from app import utils
from app import tasks
from app import config
from app import server  # required for building URLs
from app.lib.google_api_client import GoogleApiClient
from app.lib.process_duplicates_task import DailyLimitExceededError
from app import FLASK_APP as flask_app
from app.models.media_items_repository import MediaItemsRepository


@flask_app.route("/auth/me")
def me():
    unauthed_response = flask.jsonify({"logged_in": False})

    user_id = flask.session.get("user_id")
    if not user_id:
        return unauthed_response, 401

    client = GoogleApiClient.from_user_id(user_id)
    user_info = client.get_user_info()

    return flask.jsonify({"logged_in": True, "user_info": user_info})


@flask_app.route("/auth/google")
def auth():
    authorization_url, state = utils.get_authorization_url()

    flask.session["state"] = state

    # Redirect the user to the authorization URL.
    return flask.redirect(authorization_url)


@flask_app.route("/auth/google/callback")
def callback():
    state = flask.session["state"]
    credentials = utils.get_credentials(state, flask.request.url)

    client = GoogleApiClient(credentials)
    client.save_credentials()
    flask.session["user_id"] = client.get_user_id()

    return flask.redirect("/task_options")


@flask_app.route("/api/task", methods=["POST"])
def create_task():
    # TODO: Better checking of active user across authed endpoints
    user_id = flask.session.get("user_id")
    assert user_id

    task_args = {
        "refresh_media_items": flask.request.json.get("refresh_media_items"),
    }
    if "resolution" in flask.request.json:
        task_args["resolution"] = int(flask.request.json.get("resolution"))
    if "similarity_threshold" in flask.request.json:
        task_args["similarity_threshold"] = float(
            flask.request.json.get("similarity_threshold")
        )
    flask_app.logger.info(
        f"Creating task for user_id {user_id} with options: {task_args}"
    )

    result = tasks.process_duplicates.delay(user_id, **task_args)
    flask.session["active_task_id"] = result.id

    return flask.jsonify({"success": True})


expected_errors = [DailyLimitExceededError]


@flask_app.route("/api/active_task", methods=["GET"])
def get_active_task():
    result = None
    active_task_id = flask.session.get("active_task_id")
    if active_task_id:
        result = tasks.process_duplicates.AsyncResult(active_task_id)

    if (
        result is None or result.status == "PENDING"
    ):  # PENDING is the default return value of celery.result.AsyncResult, even if that task no longer exists
        return flask.jsonify({"error": "No active task found"}), 404

    response = {"status": result.status}
    if result.status in ["SUCCESS", "PROGRESS"]:
        response["meta"] = result.info["meta"]
    elif result.status == "FAILURE":
        if any(isinstance(result.info, e) for e in expected_errors):
            response["error"] = str(result.info)
    else:
        # Some other state we didn't explictly set.
        flask_app.logger.info(
            f"Excluding result info in active task response,\n\
                status: {result.status}, info: {pprint.pformat(result.info)}"
        )

    return flask.jsonify(response)


@flask_app.route("/api/active_task/results", methods=["GET"])
def get_active_task_results():
    active_task_id = flask.session.get("active_task_id")
    if not active_task_id:
        return flask.jsonify({"error": "No active task found"}), 404

    result = tasks.process_duplicates.AsyncResult(active_task_id)
    response = {}
    if result.status == "SUCCESS":
        # If the task has completed successfully, return results
        results = task_results_for_display(result.info["results"])
        response |= results

    return flask.jsonify(response)


@flask_app.route("/api/media_items/<id>", methods=["POST"])
def update_media_item(id):
    repo = MediaItemsRepository(user_id=flask.session["user_id"])
    media_item = repo.update(id, flask.request.json)

    return flask.jsonify(
        success=True,
        media_item=media_item_for_display(media_item),
    )


@flask_app.route("/api/logout", methods=["POST"])
def logout():
    flask.session.clear()
    return flask.jsonify(success=True)


def task_results_for_display(results):
    repo = MediaItemsRepository(user_id=flask.session["user_id"])
    media_item_ids = [id for g in results["groups"] for id in g["mediaItemIds"]]
    media_items_id_map = repo.get_id_map(media_item_ids)

    results_for_display = {}
    results_for_display["groups"] = {g["id"]: g for g in results["groups"]}
    results_for_display["mediaItems"] = {
        id: media_item_for_display(media_items_id_map[id]) for id in media_item_ids
    }
    results_for_display["similarityMap"] = results["similarityMap"]

    return results_for_display


def media_item_for_display(media_item):
    m = {
        k: media_item.get(k, None)
        for k in (
            "id",
            "productUrl",
            "filename",
            "mimeType",
            "deletedAt",
            "userUrl",
        )
    }

    image_url = urllib.parse.urljoin(
        config.PUBLIC_IMAGE_FOLDER,
        media_item["storageFilename"],
    )
    m["imageUrl"] = image_url

    m["dimensions"] = " x ".join(
        [
            media_item["mediaMetadata"]["width"],
            media_item["mediaMetadata"]["height"],
        ]
    )

    return m


if __name__ == "__main__":
    flask_app.run()
