import logging
import pprint
import time
from sentence_transformers import SentenceTransformer, util
from PIL import Image
from urllib.request import urlopen
from tqdm import trange
from typing import Callable
import app.config

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
    """
    Uses https://github.com/UKPLab/sentence-transformers to calculate image
    embeddings and compute cosine similarities
    """

    def __init__(
        self,
        media_items: list[dict],
        threshold: float = 0.99,
        logger=logging.getLogger(),
    ):
        # First, load the CLIP model
        self.model = SentenceTransformer("clip-ViT-B-32")

        self.media_items = media_items
        self.threshold = threshold
        self.logger = logger
        self.image_store = MediaItemsImageStore()
        self.embeddings = None

    def calculate_clusters(self):
        embeddings = self._calculate_embeddings()

        # Two parameters to tune:
        #   min_community_size: Only consider cluster that have at least 2 elements
        #   threshold: Consider sentence pairs with a cosine-similarity larger than threshold as similar
        clusters = util.community_detection(
            embeddings,
            min_community_size=2,
            threshold=self.threshold,
        )

        return clusters

    def calculate_similarity_map(self):
        embeddings = self._calculate_embeddings()

        # Contains a list with triplets (score, image_index1, image_index2) and
        # is sorted in decreasing order by score
        similarity_scores = util.paraphrase_mining_embeddings(embeddings)

        # Convert these into a dict of dict[image_id1][image_id2] = score
        similarity_map = {}
        for score, image_index1, image_index2 in similarity_scores:
            if score >= self.threshold:
                image_id1 = self.media_items[image_index1]["id"]
                image_id2 = self.media_items[image_index2]["id"]
                if image_id1 not in similarity_map:
                    similarity_map[image_id1] = {}
                similarity_map[image_id1][image_id2] = score
                if image_id2 not in similarity_map:
                    similarity_map[image_id2] = {}
                similarity_map[image_id2][image_id1] = score

        return similarity_map

    def _calculate_embeddings(self):
        if self.embeddings is not None:
            return self.embeddings
        print(
            f"Calculating embeddings for {len(self.media_items)} images "
            f"using {self.model.device}"
        )

        start = time.perf_counter()
        images = list(self._get_images())
        self.logger.info(
            f"Loaded images in {(time.perf_counter() - start):.2f} seconds"
        )

        # Calculate embeddings in bulk
        start = time.perf_counter()
        self.embeddings = self.model.encode(
            images,
            batch_size=8,
            convert_to_tensor=True,
            show_progress_bar=True,
        )
        self.logger.info(
            f"Encoded images in {(time.perf_counter() - start):.2f} seconds"
        )

        return self.embeddings

    def _get_images(self) -> Image:
        """
        Returns an iterator which yields a PIL Image object for each
          media item passed
        """
        for media_item in self.media_items:
            yield self.image_store.get_image(media_item)
