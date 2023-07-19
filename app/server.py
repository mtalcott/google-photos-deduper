import urllib.parse
import re
import flask
from app import utils
from app import tasks
from app.lib.google_api_client import GoogleApiClient
from app import FLASK_APP as flask_app


@flask_app.route("/auth/me")
def me():
    unauthed_response = flask.jsonify({"logged_in": False})

    if "credentials" not in flask.session:
        return unauthed_response, 401

    utils.refresh_session_credentials_if_invalid()
    client = GoogleApiClient(flask.session["credentials"])
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
    credentials_dict = utils.credentials_to_dict(credentials)

    # Store the credentials in the session.
    # TODO: Store in database
    flask.session["credentials"] = credentials_dict

    return flask.redirect("/task_options")


@flask_app.route("/api/task", methods=["POST"])
def create_task():
    # TODO: Save credentials in database rather than session
    credentials = flask.session["credentials"]
    flask_app.logger.info(f"Creating task with credentials: {credentials}")

    # TODO: Kick off a job to start processing
    result = tasks.process_duplicates.delay(credentials, refresh_media_items=True)
    flask.session["active_task_id"] = result.id

    return flask.jsonify({"success": True})


@flask_app.route("/api/active_task", methods=["GET"])
def get_active_task():
    active_task_id = flask.session.get("active_task_id")
    if not active_task_id:
        raise RuntimeError("No active task found")

    result = tasks.process_duplicates.AsyncResult(active_task_id)
    return flask.jsonify({"status": result.status, "info": result.info})
    # TODO: Get some websockets going to live update the page

    # show_results = False
    # fields = []
    # groups = []
    # if result.status == "SUCCESS":
    #     show_results = True
    #     fields = ["preview_with_link", "filename", "width", "height"]
    #     groups = result_groups_for_display(result.info["groups"])

    # return flask.render_template(
    #     "active_task.html",
    #     result=result,
    #     groups=groups,
    #     show_results=show_results,
    #     fields=fields,
    #     start_url=flask.url_for("start"),
    #     field_length=len(fields),
    # )


@flask_app.route("/api/logout")
def logout():
    flask.session.clear()
    return flask.redirect("/")


def result_groups_for_display(groups):
    result_groups = []
    for group in groups:
        g = []
        for media_item in group:
            m = media_item.copy()
            # TODO: figure out a way for this to work with e.g. PXL_20210303_210331830.PORTRAIT.jpg
            before_period = media_item["filename"].split(".")[0]
            quoted_filename = urllib.parse.quote(before_period)
            # Replace underscores with double underscores, for some reason
            replaced_filename = re.sub("_", "__", quoted_filename)
            m["filenameSearchUrl"] = "".join(
                ["https://photos.google.com/search/intitle:", replaced_filename]
            )
            g.append(m)
        result_groups.append(g)

    return result_groups


if __name__ == "__main__":
    flask_app.run()
