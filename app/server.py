import flask
import celery
from . import utils
from . import tasks

# Flask app setup
app = flask.Flask(__name__)
app.config.from_prefixed_env()

@app.route("/")
def index():
    return "<a href=\"/start\">Get started!</a>"

@app.route("/start")
def start():
    if 'active_task_id' in flask.session:
        return flask.redirect(flask.url_for('active_task_status'))

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

    app.logger.info(flask.session['credentials'])

    # TODO: Kick off a job to start processing
    result = tasks.process_duplicates.delay()
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
    return f"Status is {result.status}"

@app.route("/logout")
def logout():
    flask.session.clear()
    return flask.redirect(flask.url_for('index'))

if __name__ == "__main__":
    app.run()