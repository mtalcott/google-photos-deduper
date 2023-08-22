FROM python:3.9-slim-buster AS base

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

CMD watchmedo auto-restart -p '*.py' --recursive -- python -m debugpy --listen 0.0.0.0:5678 -m celery --app app.tasks worker --concurrency=16 --loglevel=INFO

########## START NEW IMAGE : PROD ###################
FROM base as prod

COPY . .

CMD gunicorn -b 0.0.0.0:5000 app:app/server