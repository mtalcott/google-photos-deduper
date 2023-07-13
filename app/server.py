import flask
from app import utils
from app import tasks
from app import FLASK_APP as flask_app


@flask_app.route("/")
def index():
    if "active_task_id" in flask.session:
        return f"<p>\
            <a href=\"{flask.url_for('active_task_status')}\">View results</a>\
        </p>"
    else:
        return f"<p>\
             <a href=\"{flask.url_for('start')}\">Get started</a>\
        </p>"


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
    credentials_dict = credentials_to_dict(credentials)

    # Store the credentials in the session.
    # TODO: Store in database
    flask.session["credentials"] = credentials_dict

    return flask.redirect(flask.url_for("start"))


@flask_app.route("/start")
def start():
    if "credentials" not in flask.session:
        # TODO: Make sure credentials are VALID, too
        return flask.redirect(flask.url_for("auth"))

    # TODO: Save credentials in database rather than session
    credentials = flask.session["credentials"]
    flask_app.logger.info(f"Creating task with credentials: {credentials}")

    # TODO: Kick off a job to start processing
    result = tasks.process_duplicates.delay(credentials, refresh_media_items=True)
    flask.session["active_task_id"] = result.id

    return flask.redirect(flask.url_for("active_task_status"))


@flask_app.route("/status")
def active_task_status():
    if "active_task_id" not in flask.session:
        return "No active task found"

    active_task_id = flask.session["active_task_id"]

    # TODO: Get status for the active job and display info about it
    result = tasks.process_duplicates.AsyncResult(active_task_id)
    # TODO: Get some websockets going to live update the page
    # TODO: React?

    show_table = False
    fields = []
    if result.status == "SUCCESS":
        show_table = True
        fields = ["preview_with_link", "filename", "width", "height"]

    return flask.render_template(
        "active_task.html",
        result=result,
        show_table=show_table,
        fields=fields,
        start_url=flask.url_for("start"),
        field_length=len(fields),
    )


@flask_app.route("/active_task_results")
def active_task_results():
    if "active_task_id" not in flask.session:
        raise "No active task found"

    active_task_id = flask.session["active_task_id"]
    result = tasks.process_duplicates.AsyncResult(active_task_id)
    return flask.jsonify(result.info)


@flask_app.route("/logout")
def logout():
    flask.session.clear()
    return flask.redirect(flask.url_for("index"))


def credentials_to_dict(credentials):
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes,
    }


if __name__ == "__main__":
    flask_app.run()
