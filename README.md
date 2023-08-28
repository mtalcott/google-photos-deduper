# Google Photos Deduper

[![Python tests build badge](https://github.com/mtalcott/google-photos-deduper/actions/workflows/python-tests.yml/badge.svg?branch=main)](https://github.com/mtalcott/google-photos-deduper/actions/workflows/python-tests.yml?query=branch%3Amain)

Locally run web app + Chrome extension to delete duplicates in Google Photos. Built with:

[![Google Photos API](https://img.shields.io/badge/Google_Photos_API-F5F7F9.svg?logo=googlephotos)](https://developers.google.com/photos)
[![Python](https://img.shields.io/badge/Python-F5F7F9.svg?logo=python)](https://www.python.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-F5F7F9.svg)](https://developers.google.com/mediapipe)
[![TypeScript](https://img.shields.io/badge/TypeScript-F5F7F9.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-F5F7F9.svg?logo=vite)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-F5F7F9.svg?logo=react)](https://react.dev/)
[![CRXJS](https://img.shields.io/badge/CRXJS-F5F7F9.svg)](https://crxjs.dev/vite-plugin)
[![Docker](https://img.shields.io/badge/Docker-F5F7F9.svg?logo=docker)](https://www.docker.com/)

## Demo

[![Demo](https://google-photos-deduper-public.s3.amazonaws.com/demo-l.gif)](https://youtu.be/QDUGKgQOa7o)

## Motivation

I've been a long-time user of [Google Photos](http://photos.google.com). When [Picasa Web Albums](https://picasa.google.com) retired, my cloud photos and albums moved to Google Photos. I have used nearly every desktop client Google provided from Picasa, to the old Google Photos desktop uploader, to [Google Drive's built-in Photos integration](https://www.blog.google/products/photos/simplifying-google-photos-and-google-drive/), and finally to [Backup and Sync](https://www.google.com/drive/download/backup-and-sync/).

Google has improved duplicate detection upon upload in recent years, but that wasn't always the case. I have tens of thousands of photos across hundreds of albums that were at some point duplicated by a desktop client. Also, even today, deleting, re-uploading, then restoring a photo results in a duplicate.

This could probably be solved by clearing out my Photos data and re-uploading everything. However, that would remove all album organization and photo descriptions. Instead, it's preferred to remove duplicates in-place. [Searches](https://support.google.com/photos/thread/3954223/is-there-an-easy-way-to-delete-duplicate-photos?hl=en) [show](https://www.quora.com/How-does-one-delete-duplicate-photos-in-Google-Photos-from-the-web-or-from-the-app-Is-there-feature-where-you-can-scan-and-delete-for-duplicates) interest in this feature from the Google Photos user base, but it hasn't ever made its way into the product.

The existing tools I could find for this problem did so only with media on the local computer, felt scammy, or didn't fully automate the deletion process. So I created this one.

It turns out the [Google Photos API](https://developers.google.com/photos) is quite limited. While apps can read limited metadata about the media items in a user's library, they cannot delete media items (photos and videos), and they can only modify media items uploaded by the app itself. This means we can't, for example, add all of the duplicates to an album for the user to review. This necessitates some kind of tool to automate the deletion of duplicates. Since we've already bought in to the Google ecosystem as a Photos user, I chose to do this with a complementary Chrome extension.

## Getting Started

No public hosted solution is currently provided due to [API usage limits](https://developers.google.com/photos/library/guides/api-limits-quotas), the overhead of [Google's app verification process](https://support.google.com/cloud/answer/9110914), cost, and user privacy considerations. Instead, follow these instructions to get the app up and running locally:

### Setup

1\. Install [Docker Desktop](https://docs.docker.com/desktop/) on your system.

2\. Clone this repository.

<details>

<summary>3. Create a Google Cloud project and OAuth credentials.</summary>
<br>

- Create a Google Cloud project ([Guide](https://developers.google.com/workspace/guides/create-project))
  - Project name: Enter `Photos Deduper`
  - Select the project
- Go to APIs & Services > Enable APIs and Services
  - Search for `Photos Library API`
  - Enable
- Go to APIs & Services > OAuth consent screen
  - User Type: Choose `External`
  - Create
    - App name: Enter `Photos Deduper`
    - User support email: Choose your email
    - Developer contact information: Enter your email
    - Save and Continue
  - Add or remove scopes:
    - Manually add scopes:
      - `https://www.googleapis.com/auth/userinfo.profile`
      - `https://www.googleapis.com/auth/userinfo.email`
      - `https://www.googleapis.com/auth/photoslibrary`
    - Update
    - Save and Continue
  - Test users:
    - Add your email (and any others you want to use the tool with)
    - Save and Continue
- Go to APIs & Services > Credentials > Create Credentials > OAuth client ID
  - Application type: Choose `Web application`
  - Name: Enter `Photos Deduper Web Client`
  - Authorized JavaScript origins: Enter `http://localhost`
  - Authorized redirect URIs: Enter `http://localhost/auth/google/callback`
  - Create
- Download the JSON file
  
</details>

4\. Set up local environment variables.

- `cp example.env .env`
- Generate [`FLASK_SECRET_KEY`](https://flask.palletsprojects.com/en/2.3.x/config/#SECRET_KEY) with `python -c 'import secrets; print(secrets.token_hex())'` and add it to `.env`.
- Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the `client_id` and `client_secret` values from the client secret file created above.

### Start

1. Run `docker-compose up` from the project directory.
1. Load [http://localhost](http://localhost) and follow the instructions from there!
   - [Install the Chrome Extension](chrome_extension/README.md) once you want to delete duplicates.

## Support

If you found a bug or have a feature request, please [open an issue](https://github.com/mtalcott/google-photos-deduper/issues/new/choose).

If you have questions about the tool, please [post on the discussions page](https://github.com/mtalcott/google-photos-deduper/discussions).

## Development

- Python app
  - Flask is set to debug mode, so live reloading is enabled.
  - Debugging with `debugpy` is supported. See [`launch.json`](.vscode/launch.json).
- React app
  - Utilizes [Vite](https://vitejs.dev/) for HMR and building.
- Chrome extension
  - Utilizes the [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin) for HMR and building.

## Say Thanks

If you found this project useful, give it a star!
