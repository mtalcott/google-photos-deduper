import pprint
import urllib.parse
import re
import flask
from app import utils
from app import tasks
from app import config
from app import server  # required for building URLs
from app.lib.google_api_client import GoogleApiClient
from app import FLASK_APP as flask_app


@flask_app.route("/auth/me")
def me():
    unauthed_response = flask.jsonify({"logged_in": False})

    user_id = flask.session.get("user_id")
    if not user_id:
        return unauthed_response, 401

    client = GoogleApiClient.from_user_id(user_id)
    user_info = client.get_user_info()

    return flask.jsonify(
        {
            "logged_in": True,
            "user_info": user_info,
            "has_active_task": "active_task_id" in flask.session,
        }
    )


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

    flask_app.logger.info(
        f"Creating task for user_id {user_id} with options: {flask.request.form.to_dict()}"
    )

    refresh_media_items = flask.request.form.get("refresh_media_items") == "true"
    result = tasks.process_duplicates.delay(
        user_id, refresh_media_items=refresh_media_items
    )
    flask.session["active_task_id"] = result.id

    return flask.jsonify({"success": True})


@flask_app.route("/api/active_task", methods=["GET"])
def get_active_task():
    active_task_id = flask.session.get("active_task_id")
    if not active_task_id:
        raise RuntimeError("No active task found")

    result = tasks.process_duplicates.AsyncResult(active_task_id)

    response = {"status": result.status}
    if result.status in ["SUCCESS", "PROGRESS"]:
        response["meta"] = result.info["meta"]
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
        raise RuntimeError("No active task found")

    result = tasks.process_duplicates.AsyncResult(active_task_id)
    response = {}
    if result.status == "SUCCESS":
        # If the task has completed successfully, return results
        results = task_results_for_display(result.info["results"])
        response |= {"results": results}

    return flask.jsonify(response)


@flask_app.route("/api/logout")
def logout():
    flask.session.clear()
    return flask.redirect("/")


def task_results_for_display(results):
    results_for_display = results.copy()

    result_groups = []
    for group in results["groups"]:
        g = {"id": group["id"], "mediaItems": []}
        for media_item in group["mediaItems"]:
            m = media_item_for_display(media_item)
            g["mediaItems"].append(m)
        result_groups.append(g)

    return results_for_display | {"groups": result_groups}


def media_item_for_display(media_item):
    m = {
        k: media_item[k]
        for k in (
            "id",
            "isOriginal",
            "productUrl",
            "filename",
            "mimeType",
        )
    }

    image_url = urllib.parse.urljoin(
        config.PUBLIC_IMAGE_FOLDER,
        media_item["storageFilename"],
    )
    m["imageUrl"] = image_url

    # TODO: figure out a way for this to work with e.g. PXL_20210303_210331830.PORTRAIT.jpg
    before_period = media_item["filename"].split(".")[0]
    quoted_filename = urllib.parse.quote(before_period)
    # Replace underscores with double underscores, for some reason
    replaced_filename = re.sub("_", "__", quoted_filename)
    filename_search_url = "".join(
        ["https://photos.google.com/search/intitle:", replaced_filename]
    )
    m["filenameSearchUrl"] = filename_search_url

    m["dimensions"] = " x ".join(
        [
            media_item["mediaMetadata"]["width"],
            media_item["mediaMetadata"]["height"],
        ]
    )

    return m


if __name__ == "__main__":
    flask_app.run()
