FROM python:3.9 AS base

RUN apt-get update && apt-get install -y \
    python3-opencv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

########### START NEW IMAGE : DEV ###################
FROM base as dev

COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY . .

######### START NEW IMAGE : DEV-SERVER ##############
FROM dev as dev-server

CMD python -m debugpy --listen 0.0.0.0:5678 -m flask --app app/server run --host 0.0.0.0

######### START NEW IMAGE : DEV-WORKER ##############
FROM dev as dev-worker

CMD watchmedo auto-restart -p '*.py' --recursive -- python -m debugpy --listen 0.0.0.0:5678 -m celery --app app.tasks worker --concurrency=${CELERY_CONCURRENCY:-16} --loglevel=INFO

######### START NEW IMAGE : SERVER #############
FROM base as server

COPY . .

# Run the web service on container startup. Here we use the gunicorn
# webserver, with one worker process and 8 threads.
# For environments with multiple CPU cores, increase the number of workers
# to be equal to the cores available.
# Timeout is set to 0 to disable the timeouts of the workers to allow Cloud Run to handle instance scaling.
CMD gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app.server:flask_app
# CMD gunicorn -b 0.0.0.0:5000 app:app/server

######### START NEW IMAGE : WORKER #############
FROM base as worker

COPY . .

CMD celery --app app.tasks worker --concurrency=${CELERY_CONCURRENCY:-16} --loglevel=INFO