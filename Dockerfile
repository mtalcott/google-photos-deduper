FROM python:3.9-slim-buster AS base

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

########### START NEW IMAGE : DEBUG ###################

FROM base as debug
RUN pip install --no-cache-dir -r requirements-dev.txt

CMD python -m debugpy --listen 0.0.0.0:5678 --wait-for-client -m google_photos_deduper

########### START NEW IMAGE : PROD ####################

FROM base as prod

CMD python -m google_photos_deduper
