const {google} = require('googleapis');
const MediaItem = require('../models/MediaItem');

class GooglePhotosClient {

  constructor(args) {
    let {token, user} = args;
    this.userId = user._id;
    this.accessToken = token.accessToken;
    this.refreshToken = token.refreshToken;

    this.authObj = new google.auth.OAuth2(
      process.env.GOOGLE_ID,
      process.env.GOOGLE_SECRET
      // "http://localhost:8080/auth/google/callback"
    );

    this.authObj.setCredentials({
      refresh_token: token.refreshToken,
      access_token: this.accessToken
    });
  }

  async getMediaItems({onUpdate}) {
    const maxItems = 2000;
    let response, nextPageToken, itemCount = 0;
    let params = {
      pageSize: 100
    };

    onUpdate({statusText: 'Gathering photo metadata...'});
    
    while (itemCount < maxItems) {
      if (nextPageToken) {
        params.pageToken = nextPageToken;
      }

      response = await this.authObj.request({
        url: "https://photoslibrary.googleapis.com/v1/mediaItems",
        method: 'GET',
        params
      });
      // console.log(`response: ${JSON.stringify(response, undefined, 2)}`);

      if (response.status == 200) {
        // let ids = response.data.mediaItems.map((item) => item.id);
        // console.log(`ids: ${JSON.stringify(ids, undefined, 2)}`);

        for (const mediaItemData of response.data.mediaItems) {
          // console.log(`index: ${JSON.stringify(index, undefined, 2)}`);

          let mediaItem = await MediaItem.findOne({
            userId: this.userId,
            id: mediaItemData.id
          });
          if (mediaItem) {
            // console.log(`Found existing mediaItem with id ${mediaItemData.id}`);
            // Already in our database. No-op.
          } else {
            // console.log(`Saving new mediaItem with id ${mediaItemData.id}`);
            mediaItem = new MediaItem({
              userId: this.userId,
              ...mediaItemData
            });
            await mediaItem.save();
          }
        }

        // await MediaItem.insertMany(response.data.mediaItems);

        itemCount += response.data.mediaItems.length;
        nextPageToken = response.data.nextPageToken;

        onUpdate({itemCount: itemCount});

        console.log(`Retrieved ${itemCount} mediaItems so far`);
      }
      
    }
    
    return itemCount;
  }

  async findDuplicateMediaItems({onUpdate}) {
    onUpdate({statusText: 'Searching for duplicates...'});

    console.log(`this.userId: ${JSON.stringify(this.userId, undefined, 2)}`);
    let myUserId = this.userId;
    
    let groupedMediaItems = await MediaItem.aggregate([
      { // Filter down to this user's media items
        $match: {
          "userId": this.userId
        }
      }, { // Group by attributes that indicate duplicate media items
        $group: {
          _id: {
            filename: "$filename",
            mimeType: "$mimeType",
            height: "$mediaMetadata.height",
            width: "$mediaMetadata.width"
          },
          "count": {$sum: 1},
          "ids": {$push: "$_id"}
        }
      }, { // Filter down to only groups that contain duplicates
        $match: {
          "count": {$gt: 1}
        }
      }
    ]).exec();

    console.log(`groupedMediaItems: ${JSON.stringify(groupedMediaItems, undefined, 2)}`);
    await onUpdate({groupedMediaItems});
  }

}

exports.GooglePhotosClient = GooglePhotosClient;
