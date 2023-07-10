import flask
from . import APP as app
from . import utils
from . import tasks

@app.route("/")
def index():
    if 'active_task_id' in flask.session:
        return f"<p>\
            <a href=\"{flask.url_for('active_task_status')}\">View results</a>\
        </p>"
    else:
        return f"<p>\
             <a href=\"{flask.url_for('start')}\">Get started</a>\
        </p>"

@app.route("/auth/google")
def auth():
    authorization_url, state = utils.get_authorization_url()

    flask.session['state'] = state

    # Redirect the user to the authorization URL.
    return flask.redirect(authorization_url)

@app.route("/auth/google/callback")
def callback():
    state = flask.session['state']
    credentials = utils.get_credentials(
        state,
        flask.request.url)

    # Store the credentials in the session.
    # TODO: Store in database
    flask.session['credentials'] = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes}

    return flask.redirect(flask.url_for('start'))

@app.route("/start")
def start():
    if 'credentials' not in flask.session:
        # TODO: Make sure credentials are VALID, too
        return flask.redirect(flask.url_for('auth'))

    # TODO: Save credentials in database rather than session
    credentials = flask.session['credentials']
    app.logger.info(f"Creating task with credentials: {credentials}")

    # TODO: Kick off a job to start processing
    result = tasks.process_duplicates.delay(credentials,
                                            refresh_media_items=True)
    flask.session['active_task_id'] = result.id

    return flask.redirect(flask.url_for('active_task_status'))

@app.route("/status")
def active_task_status():
    if 'active_task_id' not in flask.session:
        return 'No active task found'
    
    active_task_id = flask.session['active_task_id']
    app.logger.info(f"active_task_id: {active_task_id}")
    
    # TODO: Get status for the active job and display info about it
    result = tasks.process_duplicates.AsyncResult(active_task_id)
    # TODO: Get some websockets going to live update the page
    # TODO: React?
    return f"<p>\
        Status: {result.status}\
    </p><p>\
        <a href=\"{flask.url_for('start')}\">Start over</a>\
    </p>"

@app.route("/logout")
def logout():
    flask.session.clear()
    return flask.redirect(flask.url_for('index'))

if __name__ == "__main__":
    app.run()