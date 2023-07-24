import logging
import pprint
from sentence_transformers import SentenceTransformer, util
from PIL import Image
from urllib.request import urlopen

from typing_extensions import Protocol

# import glob
# import torch
# import pickle
# import zipfile
# from IPython.display import display
# from IPython.display import Image as IPImage
# import os
# from tqdm.autonotebook import tqdm

# See:
#   - https://github.com/UKPLab/sentence-transformers/blob/master/examples/applications/image-search/Image_Duplicates.ipynb
#   - https://www.sbert.net/examples/applications/image-search/README.html


class DuplicateImageDetector:
    """Uses https://github.com/UKPLab/sentence-transformers to calculate image embeddings and compute cosine similarities"""

    def __init__(self):
        # First, load the CLIP model
        self.model = SentenceTransformer("clip-ViT-B-32")

    def calculate_clusters(self, media_items, threshold=0.99, resolution=[100, 100]):
        images = list(self._get_images(media_items, resolution))

        # Calculate embeddings in bulk
        embeddings = self.model.encode(
            images, batch_size=128, convert_to_tensor=True, show_progress_bar=True
        )

        # # duplicates contains a list with triplets (score, image_id1, image_id2) and is sorted in decreasing order
        # duplicates = util.paraphrase_mining_embeddings(embeddings)
        # logging.info(f"duplicates: {pprint.pformat(duplicates)}")

        # Two parameters to tune:
        #   min_cluster_size: Only consider cluster that have at least 2 elements
        #   threshold: Consider sentence pairs with a cosine-similarity larger than threshold as similar

        clusters = util.community_detection(
            embeddings, min_community_size=2, threshold=threshold
        )

        # duplicates contains a list with triplets (score, image_id1, image_id2) and is sorted in decreasing order
        # duplicates = util.paraphrase_mining_embeddings(embeddings)

        return clusters

    def _get_images(self, media_items, resolution):
        """
        Returns an iterator which yields a PIL Image object for each
          media item passed
        """
        # return ImageIterator(media_items, resolution)
        width, height = resolution
        for media_item in media_items:
            url = f"{media_item['baseUrl']}=w{width}-h{height}"
            yield Image.open(urlopen(url))


# class ImageIterator:
#     def __init__(self, media_items, resolution):
#         self.width, self.height = resolution
#         self.media_items = media_items
#         self.index = 0

#     def __iter__(self):
#         return self

#     def __next__(self):
#         media_item = self.media_items.next()
#         if media_item:
#             url = f"{media_item.baseUrl}=w{self.width}-h{self.height}"
#             return Image.open(urlopen(url))
#         else:
#             raise StopIteration
