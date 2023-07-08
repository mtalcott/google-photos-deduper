FROM python:3.9-slim-buster AS base

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

########### START NEW IMAGE : DEBUG ###################

FROM base as debug
RUN pip install --no-cache-dir -r requirements-dev.txt

CMD python -m debugpy --listen 0.0.0.0:5678 -m flask run --host 0.0.0.0

########### START NEW IMAGE : PROD ####################

FROM base as prod

CMD gunicorn -b 0.0.0.0:5000 app:app