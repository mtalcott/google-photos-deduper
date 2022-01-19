# Google Photos Deduper

Personal project by [Mack Talcott](https://github.com/mtalcott).

## Motivation

I've been a long-time user of [Google Photos](http://photos.google.com). When [Picasa Web Albums](https://picasa.google.com) retired, my cloud photos and albums moved to Google Photos. I have used nearly every desktop client Google provided from Picasa, to the old Google Photos desktop uploader, to [Google Drive's built-in Photos integration](https://www.blog.google/products/photos/simplifying-google-photos-and-google-drive/), and finally to [Backup and Sync](https://www.google.com/drive/download/backup-and-sync/).

More recently, Google has improved duplicate detection upon upload, but that wasn't always the case. I have thousands of photos across dozens of albums that, through one OS reinstall or another, were duplicated by a desktop client.

I could solve this clearing out my Photos data and re-uploading everything. However, I don't want to lose all of my album organization and photo descriptions. So, I aim to fix my data in-place using the [Google Photos API](https://developers.google.com/photos) to detect duplicates using basic metadata (filename, height, width, etc.), add duplicates to an album, then remove them.

---

## Prerequisites

Install [Docker](https://www.docker.com/) on your system.

* [Install instructions](https://docs.docker.com/installation/mac/) for Mac OS X
* [Install instructions](https://docs.docker.com/installation/ubuntulinux/) for Ubuntu Linux
* [Install instructions](https://docs.docker.com/installation/) for other platforms

Install [Docker Compose](http://docs.docker.com/compose/) on your system.

## Setup

Run `docker-compose build`.

## Start

- Run `docker-compose run python python -m google_photos_deduper`.
- Follow instructions in the interactive shell session.

## Development

-  Debugging with `debugpy`: `docker-compose run python python -m debugpy --listen 0.0.0.0:5678 -m google_photos_deduper`