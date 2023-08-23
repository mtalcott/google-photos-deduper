import os
import dotenv

APP_NAME = "app"

# By default .env will be loaded
dotenv.load_dotenv()

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

REDIS_HOST = os.environ.get("REDIS_HOST")

MONGODB_URI = os.environ.get("MONGODB_URI")
DATABASE = os.environ.get("DATABASE")

IMAGE_STORE_PATH = os.environ.get("IMAGE_STORE_PATH")
TEMP_PATH = "tmp/"
PUBLIC_IMAGE_FOLDER = os.environ.get("PUBLIC_IMAGE_FOLDER")

CLIENT_HOST = os.environ.get("CLIENT_HOST")
