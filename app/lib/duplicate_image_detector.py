import logging
import pprint
import time
from sentence_transformers import SentenceTransformer, util
from PIL import Image
from urllib.request import urlopen
from tqdm import trange
from typing import Callable

from typing_extensions import Protocol

from app.lib.media_items_image_store import MediaItemsImageStore

# import glob
# import torch
# import pickle
# import zipfile
# from IPython.display import display
# from IPython.display import Image as IPImage
# import os

# See:
#   - https://github.com/UKPLab/sentence-transformers/blob/master/examples/applications/image-search/Image_Duplicates.ipynb
#   - https://www.sbert.net/examples/applications/image-search/README.html


class DuplicateImageDetector:
    """Uses https://github.com/UKPLab/sentence-transformers to calculate image embeddings and compute cosine similarities"""

    def __init__(self, logger=logging.getLogger()):
        # First, load the CLIP model
        self.model = SentenceTransformer("clip-ViT-B-32")
        self.image_store = MediaItemsImageStore()
        self.logger = logger

    def calculate_clusters(
        self,
        media_items,
        threshold=0.99,
    ):
        start = time.perf_counter()
        images = list(self._get_images(media_items))
        self.logger.info(
            f"Loaded images in {(time.perf_counter() - start):.2f} seconds"
        )

        # Calculate embeddings in bulk
        start = time.perf_counter()
        embeddings = self.model.encode(
            images,
            batch_size=8,
            convert_to_tensor=True,
            show_progress_bar=True,
        )
        self.logger.info(
            f"Encoded images in {(time.perf_counter() - start):.2f} seconds"
        )

        # # duplicates contains a list with triplets (score, image_id1, image_id2) and is sorted in decreasing order
        # duplicates = util.paraphrase_mining_embeddings(embeddings)
        # logging.info(f"duplicates: {pprint.pformat(duplicates)}")

        # Two parameters to tune:
        #   min_cluster_size: Only consider cluster that have at least 2 elements
        #   threshold: Consider sentence pairs with a cosine-similarity larger than threshold as similar

        clusters = util.community_detection(
            embeddings,
            min_community_size=2,
            threshold=threshold,
        )

        # duplicates contains a list with triplets (score, image_id1, image_id2) and is sorted in decreasing order
        # duplicates = util.paraphrase_mining_embeddings(embeddings)

        return clusters

    def _get_images(self, media_items) -> Image:
        """
        Returns an iterator which yields a PIL Image object for each
          media item passed
        """
        for media_item in media_items:
            yield self.image_store.get_image(media_item)
