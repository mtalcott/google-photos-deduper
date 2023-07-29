FROM python:3.9 AS base

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

########### START NEW IMAGE : DEV ###################
FROM base as dev

RUN pip install --no-cache-dir -r requirements-dev.txt

######### START NEW IMAGE : DEV-SERVER ##############
FROM dev as dev-server

CMD python -m debugpy --listen 0.0.0.0:5678 -m flask --app app/server run --host 0.0.0.0

######### START NEW IMAGE : DEV-WORKER ##############
FROM dev as dev-worker

CMD watchmedo auto-restart -p '*.py' --recursive -- python -m debugpy --listen 0.0.0.0:5678 -m celery --app app.tasks worker --loglevel=INFO

########## START NEW IMAGE : PROD ###################
FROM base as prod

CMD gunicorn -b 0.0.0.0:5000 app:app/server