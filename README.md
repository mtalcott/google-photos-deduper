# Google Photos Deduper

Personal project by [Mack Talcott](https://github.com/mtalcott).

## Motivation

I've been a long-time user of [Google Photos](http://photos.google.com). When [Picasa Web Albums](https://picasa.google.com) retired, my cloud photos and albums moved to Google Photos. I have used nearly every desktop client Google provided from Picasa, to the old Google Photos desktop uploader, to [Google Drive's built-in Photos integration](https://www.blog.google/products/photos/simplifying-google-photos-and-google-drive/), and finally to [Backup and Sync](https://www.google.com/drive/download/backup-and-sync/).

More recently, Google has improved duplicate detection upon upload, but that wasn't always the case. I have thousands of photos across dozens of albums that, through one OS reinstall or another, were duplicated by a desktop client.

I could solve this clearing out my Photos data and re-uploading everything. However, I don't want to lose all of my album organization and photo descriptions. So, I aim to fix my data in-place using the [Google Photos API](https://developers.google.com/photos) to detect duplicates using basic metadata (filename, height, width, etc.), add duplicates to an album, then remove them.

## Progress

:warning: This project is a work in progress and will not currently make any changes to photos. :warning:

Upon implementation, I discovered that **the Google Photos API does not allow apps to modify photos that were added outside the app**. Unfortunately, this even includes associating a photo created outside the app with an album that was created by the app, so I was unable to figure out a way not only to programmatically remove duplicates, but even to create an album of duplicates for the user to action on in the Google Photos UI.

Here's what this tool currently does, and what still needs to be added for it to function properly:

- Authorization
  - [x] Obtain user authorization to access the [Google Photos API](https://developers.google.com/photos/library/guides/overview) via the OAuth 2.0 [Out-Of-Band (OOB) flow](https://developers.google.com/identity/protocols/oauth2/native-app#manual-copypaste) using an [app client secret file](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred) (not provided).
  - [ ] TODO: Now that the OOB flow has been deprecated as of October 2022, [migrate to a more secure, web-based flow](https://developers.google.com/identity/protocols/oauth2/resources/oob-migration).
  - [ ] TODO: Import the client secret file via an environment variable.
- Duplicate detection
  - [x] Populate a MongoDB database with media item metadata.
    - [ ] TODO: Segment data by userId.
  - [x] Perform simple duplicate detection based on metadata (filename, media type, dimensions).
  - [ ] TODO: Provide options for more advanced duplicate detection - via [a Python library](https://github.com/up42/image-similarity-measures) or [some other image processing](https://github.com/awslabs/aws-ai-solution-kit).
- User Interaction
  - [ ] TODO: Provide a web page displaying detected duplicates.
  - [ ] TODO: Provide a way to review (and even adjust) duplicates before processing.
- Processing
  - [ ] TODO: Add duplicates to a new album for user to action on (delete) through the Google Photos UI.

---

## Prerequisites

Install [Docker](https://www.docker.com/) on your system.

* [Install instructions](https://docs.docker.com/installation/mac/) for Mac OS X
* [Install instructions](https://docs.docker.com/installation/ubuntulinux/) for Ubuntu Linux
* [Install instructions](https://docs.docker.com/installation/) for other platforms

Install [Docker Compose](http://docs.docker.com/compose/) on your system.

Generate an app client secret file.

- Follow [these instructions](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred) to create a project and OAuth 2.0 Client ID for a web application using Google Developer Console.
- Download your client secret file.
- `cp .example.env .env`
- Generate [`FLASK_SECRET_KEY`](https://flask.palletsprojects.com/en/2.3.x/config/#SECRET_KEY) with `python -c 'import secrets; print(secrets.token_hex())'` and add it to `.env`.
- Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the `client_id` and `client_secret` values from the client secret file you downloaded.

## Setup

Run `docker-compose build`.

## Start

- Run `docker-compose up`.
- Load [http://localhost:3000](http://localhost:3000).

## Development

- Flask is set to debug mode, so live reloading is enabled.
- Debugging with `debugpy` is supported. See `launch.json`.
