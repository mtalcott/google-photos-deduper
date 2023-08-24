import logging
import os
import queue
import time
import numpy as np

import requests
import torch
from tqdm import trange
import mediapipe as mp

from app.lib.media_items_image_store import MediaItemsImageStore
from app import config

BaseOptions = mp.tasks.BaseOptions
ImageEmbedder = mp.tasks.vision.ImageEmbedder
ImageEmbedderOptions = mp.tasks.vision.ImageEmbedderOptions
ImageEmbedderResult = mp.tasks.vision.ImageEmbedderResult
VisionRunningMode = mp.tasks.vision.RunningMode


class DuplicateImageDetector:
    """
    Uses https://developers.google.com/mediapipe to calculate image
    embeddings and compute cosine similarities
    """

    MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_large/float32/latest/mobilenet_v3_large.tflite"

    def __init__(
        self,
        media_items: list[dict],
        threshold: float = 0.99,
        logger=logging.getLogger(),
    ):
        self.media_items = media_items
        self.threshold = threshold
        self.logger = logger
        self.image_store = MediaItemsImageStore()
        self.embeddings: torch.Tensor = None

    def calculate_groups(self):
        embeddings = self._calculate_embeddings()

        start = time.perf_counter()
        # Two parameters to tune:
        #   min_community_size: Only consider cluster that have at least 2 elements
        #   threshold: Consider sentence pairs with a cosine-similarity larger than threshold as similar
        groups = self._community_detection(
            embeddings,
            min_community_size=2,
            threshold=self.threshold,
        )
        self.logger.info(
            f"Calculated groups in {(time.perf_counter() - start):.2f} seconds"
        )

        return groups

    def calculate_similarity_map(self):
        embeddings = self._calculate_embeddings()

        # Contains a list with triplets (score, image_index1, image_index2) and
        # is sorted in decreasing order by score
        start = time.perf_counter()
        similarity_scores = self._paraphrase_mining_embeddings(embeddings)
        self.logger.info(
            f"Calculated similarity map in {(time.perf_counter() - start):.2f} seconds"
        )

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

        model_path = os.path.join(config.TEMP_PATH, "mobilenet_v3_large.tflite")
        if not os.path.exists(model_path):
            print(f"Downloading model")
            request = requests.get(
                self.MODEL_URL,
                timeout=20,
            )
            with open(model_path, "wb") as file:
                file.write(request.content)

        print(f"Calculating embeddings for {len(self.media_items)} images")
        start = time.perf_counter()
        embeddings = []

        options = ImageEmbedderOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            l2_normalize=True,
            running_mode=VisionRunningMode.IMAGE,
        )

        with ImageEmbedder.create_from_options(options) as embedder:
            for i in trange(len(self.media_items), ascii=False):
                media_item = self.media_items[i]
                storage_path = self._get_storage_path(media_item)
                mp_image = mp.Image.create_from_file(storage_path)
                embedding_result = embedder.embed(mp_image)
                embeddings.append(embedding_result.embeddings[0].embedding)

        self.logger.info(
            f"Calculated embeddings in {(time.perf_counter() - start):.2f} seconds"
        )

        self.embeddings = torch.tensor(np.array(embeddings))
        return self.embeddings

    # From https://github.com/UKPLab/sentence-transformers/blob/a458ce79c40fef93d5ecc66931b446ea65fdd017/sentence_transformers/util.py#L346
    def _community_detection(
        self,
        embeddings: torch.Tensor,
        threshold=0.99,
        min_community_size=2,
        batch_size=128,
    ):
        """
        Function for Fast Community Detection
        Finds in the embeddings all communities, i.e. embeddings that are close (closer than threshold).
        Returns only communities that are larger than min_community_size. The communities are returned
        in decreasing order. The first element in each list is the central point in the community.
        """
        threshold = torch.tensor(threshold, device=embeddings.device)

        extracted_communities = []

        # Maximum size for community
        min_community_size = min(min_community_size, len(embeddings))
        sort_max_size = min(max(2 * min_community_size, 50), len(embeddings))

        for start_idx in range(0, len(embeddings), batch_size):
            # Compute cosine similarity scores
            cos_scores = self._cos_sim(
                embeddings[start_idx : start_idx + batch_size], embeddings
            )

            # Minimum size for a community
            top_k_values, _ = cos_scores.topk(k=min_community_size, largest=True)

            # Filter for rows >= min_threshold
            for i in range(len(top_k_values)):
                if top_k_values[i][-1] >= threshold:
                    new_cluster = []

                    # Only check top k most similar entries
                    top_val_large, top_idx_large = cos_scores[i].topk(
                        k=sort_max_size, largest=True
                    )

                    # Check if we need to increase sort_max_size
                    while top_val_large[-1] > threshold and sort_max_size < len(
                        embeddings
                    ):
                        sort_max_size = min(2 * sort_max_size, len(embeddings))
                        top_val_large, top_idx_large = cos_scores[i].topk(
                            k=sort_max_size, largest=True
                        )

                    for idx, val in zip(top_idx_large.tolist(), top_val_large):
                        if val < threshold:
                            break

                        new_cluster.append(idx)

                    extracted_communities.append(new_cluster)

            del cos_scores

        # Largest cluster first
        extracted_communities = sorted(
            extracted_communities, key=lambda x: len(x), reverse=True
        )

        # Step 2) Remove overlapping communities
        unique_communities = []
        extracted_ids = set()

        for cluster_id, community in enumerate(extracted_communities):
            community = sorted(community)
            non_overlapped_community = []
            for idx in community:
                if idx not in extracted_ids:
                    non_overlapped_community.append(idx)

            if len(non_overlapped_community) >= min_community_size:
                unique_communities.append(non_overlapped_community)
                extracted_ids.update(non_overlapped_community)

        unique_communities = sorted(
            unique_communities, key=lambda x: len(x), reverse=True
        )

        return unique_communities

    def _cos_sim(self, a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        """
        Computes the cosine similarity cos_sim(a[i], b[j]) for all i and j.
        Assumes tensors have already been l2-normalized.
        :return: Matrix with res[i][j]  = cos_sim(a[i], b[j])
        """
        return torch.mm(a, b.transpose(0, 1))

    # From https://github.com/UKPLab/sentence-transformers/blob/a458ce79c40fef93d5ecc66931b446ea65fdd017/sentence_transformers/util.py#L136
    def _paraphrase_mining_embeddings(
        self,
        embeddings: torch.Tensor,
        query_chunk_size: int = 500,
        corpus_chunk_size: int = 10000,
        max_pairs: int = 500000,
        top_k: int = 10,
    ):
        """
        Given a list of sentences / texts, this function performs paraphrase mining. It compares all sentences against all
        other sentences and returns a list with the pairs that have the highest cosine similarity score.

        :param embeddings: A tensor with the embeddings
        :param query_chunk_size: Search for most similar pairs for #query_chunk_size at the same time. Decrease, to lower memory footprint (increases run-time).
        :param corpus_chunk_size: Compare a sentence simultaneously against #corpus_chunk_size other sentences. Decrease, to lower memory footprint (increases run-time).
        :param max_pairs: Maximal number of text pairs returned.
        :param top_k: For each sentence, we retrieve up to top_k other sentences
        :param score_function: Function for computing scores. By default, cosine similarity.
        :return: Returns a list of triplets with the format [score, id1, id2]
        """

        top_k += 1  # A sentence has the highest similarity to itself. Increase +1 as we are interest in distinct pairs

        # Mine for duplicates
        pairs = queue.PriorityQueue()
        min_score = -1
        num_added = 0

        for corpus_start_idx in range(0, len(embeddings), corpus_chunk_size):
            for query_start_idx in range(0, len(embeddings), query_chunk_size):
                scores = self._cos_sim(
                    embeddings[query_start_idx : query_start_idx + query_chunk_size],
                    embeddings[corpus_start_idx : corpus_start_idx + corpus_chunk_size],
                )

                scores_top_k_values, scores_top_k_idx = torch.topk(
                    scores,
                    min(top_k, len(scores[0])),
                    dim=1,
                    largest=True,
                    sorted=False,
                )
                scores_top_k_values = scores_top_k_values.tolist()
                scores_top_k_idx = scores_top_k_idx.tolist()

                for query_itr in range(len(scores)):
                    for top_k_idx, corpus_itr in enumerate(scores_top_k_idx[query_itr]):
                        i = query_start_idx + query_itr
                        j = corpus_start_idx + corpus_itr

                        if (
                            i != j
                            and scores_top_k_values[query_itr][top_k_idx] > min_score
                        ):
                            pairs.put((scores_top_k_values[query_itr][top_k_idx], i, j))
                            num_added += 1

                            if num_added >= max_pairs:
                                entry = pairs.get()
                                min_score = entry[0]

            # Get the pairs
            added_pairs = set()  # Used for duplicate detection
            pairs_list = []
            while not pairs.empty():
                score, i, j = pairs.get()
                sorted_i, sorted_j = sorted([i, j])

                if sorted_i != sorted_j and (sorted_i, sorted_j) not in added_pairs:
                    added_pairs.add((sorted_i, sorted_j))
                    pairs_list.append([score, i, j])

            # Highest scores first
            pairs_list = sorted(pairs_list, key=lambda x: x[0], reverse=True)
            return pairs_list

    def _get_storage_path(self, media_item) -> str:
        return self.image_store.get_storage_path(media_item["storageFilename"])
