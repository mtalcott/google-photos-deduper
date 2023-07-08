import flask
from . import utils

# Flask app setup
app = flask.Flask(__name__)
app.config.from_prefixed_env()

@app.route("/")
def index():
    return "<a href=\"/start\">Get started!</a>"

@app.route("/start")
def start():
    if 'active_job_id' in flask.session:
        return flask.redirect(flask.url_for('active_job_status'))

    authorization_url, state = utils.get_authorization_url(
        redirect_url=__get_oauth_redirect_url())

    flask.session['state'] = state

    # Redirect the user to the authorization URL.
    return flask.redirect(authorization_url)

@app.route("/auth/google/callback")
def callback():
    state = flask.session['state']
    credentials = utils.get_credentials(
        redirect_url=__get_oauth_redirect_url(),
        state=state,
        authorization_response=flask.request.url)

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
    flask.session['active_job_id'] = 1

    return flask.redirect(flask.url_for('active_job_status'))

@app.route("/status")
def active_job_status():
    active_job_id = flask.session['active_job_id']
    app.logger.info(f"active_job_id: {active_job_id}")
    
    # TODO: Get status for the active job and display info about it
    # TODO: Get some websockets going to live update the page
    # TODO: React?
    return 'Status: not started'

@app.route("/logout")
def logout():
    flask.session.clear()
    return flask.redirect(flask.url_for('index'))

def __get_oauth_redirect_url():
    return flask.url_for('callback', _external=True)

if __name__ == "__main__":
    app.run()