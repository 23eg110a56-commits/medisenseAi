import os
import json
import logging
import numpy as np
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Attempt to import ML libraries
try:
    from sentence_transformers import SentenceTransformer
    import faiss
    HAS_ML_LIBS = True
except ImportError as e:
    logger.warning(f"ML Libraries (faiss/sentence-transformers) not loaded: {e}. Falling back to API/in-memory simulation.")
    HAS_ML_LIBS = False

KB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge_base"))
INDEX_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
INDEX_PATH = os.path.join(INDEX_DIR, "faiss_index.bin")
METADATA_PATH = os.path.join(INDEX_DIR, "metadata.json")

class RAGEngine:
    def __init__(self):
        self.model = None
        self.index = None
        self.chunks: List[Dict[str, Any]] = []
        self.dimension = 384  # Dimension of all-MiniLM-L6-v2

    def init_engine(self):
        os.makedirs(INDEX_DIR, exist_ok=True)
        
        if not os.path.exists(KB_DIR):
            os.makedirs(KB_DIR, exist_ok=True)
            logger.warning(f"Knowledge base directory {KB_DIR} did not exist and was created.")
            
        if not HAS_ML_LIBS:
            logger.info("Initializing simulated RAG engine (pure Python fallback).")
            self._load_fallback_data()
            return

        try:
            logger.info("Initializing SentenceTransformer model (all-MiniLM-L6-v2)...")
            self.model = SentenceTransformer("all-MiniLM-L6-v2")
            
            # Check if index exists already
            if os.path.exists(INDEX_PATH) and os.path.exists(METADATA_PATH):
                logger.info("Loading existing FAISS index...")
                self.index = faiss.read_index(INDEX_PATH)
                with open(METADATA_PATH, "r", encoding="utf-8") as f:
                    self.chunks = json.load(f)
                logger.info(f"Loaded FAISS index with {len(self.chunks)} chunks.")
            else:
                logger.info("No index found. Building FAISS index from knowledge base files...")
                self.rebuild_index()
        except Exception as e:
            logger.error(f"Error initializing RAG engine: {e}. Falling back to simulation.")
            self._load_fallback_data()

    def rebuild_index(self):
        if not HAS_ML_LIBS or not self.model:
            logger.warning("Cannot rebuild index without ML libraries. Simulating index rebuild.")
            self._load_fallback_data()
            return

        logger.info(f"Reading medical knowledge base documents from {KB_DIR}...")
        self.chunks = []
        
        if not os.path.exists(KB_DIR):
            logger.error("Knowledge base folder not found!")
            return

        files = [f for f in os.listdir(KB_DIR) if f.endswith(".txt") or f.endswith(".md")]
        if not files:
            logger.warning("No knowledge base documents found. Index will be empty.")
            return

        for filename in files:
            filepath = os.path.join(KB_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Chunk content by sections or headers
                # We can split on double newlines to get logical paragraphs
                paragraphs = content.split("\n\n")
                current_chunk = ""
                
                for para in paragraphs:
                    para = para.strip()
                    if not para:
                        continue
                    # If paragraph starts with heading or is large, we keep it as a chunk
                    if para.startswith("#") or len(current_chunk) + len(para) > 600:
                        if current_chunk:
                            self.chunks.append({
                                "source": filename,
                                "content": current_chunk.strip()
                            })
                        current_chunk = para
                    else:
                        current_chunk += "\n\n" + para
                
                if current_chunk:
                    self.chunks.append({
                        "source": filename,
                        "content": current_chunk.strip()
                    })
            except Exception as e:
                logger.error(f"Error parsing file {filename}: {e}")

        if not self.chunks:
            logger.warning("No text chunks extracted from knowledge base.")
            return

        logger.info(f"Generated {len(self.chunks)} text chunks. Generating embeddings...")
        texts = [chunk["content"] for chunk in self.chunks]
        embeddings = self.model.encode(texts, show_progress_bar=False)
        embeddings = np.array(embeddings).astype("float32")

        # Create FAISS Index
        logger.info("Building FAISS index...")
        self.index = faiss.IndexFlatL2(self.dimension)
        self.index.add(embeddings)
        
        # Save FAISS Index
        faiss.write_index(self.index, INDEX_PATH)
        with open(METADATA_PATH, "w", encoding="utf-8") as f:
            json.dump(self.chunks, f, ensure_ascii=False, indent=2)
            
        logger.info("FAISS index built and saved successfully!")

    def query(self, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
        if not query_text or not self.chunks:
            return []

        # Dual Mode: If ML libraries are available
        if HAS_ML_LIBS and self.index and self.model:
            try:
                query_vector = self.model.encode([query_text]).astype("float32")
                distances, indices = self.index.search(query_vector, top_k)
                
                results = []
                for dist, idx in zip(distances[0], indices[0]):
                    if idx != -1 and idx < len(self.chunks):
                        chunk = self.chunks[idx].copy()
                        chunk["score"] = float(dist)
                        results.append(chunk)
                return results
            except Exception as e:
                logger.error(f"Error searching FAISS index: {e}")
                # Fallback to simple containment search on exception
        
        # Fallback keyword-based or simple text containment search
        logger.info("Executing fallback keyword-based retrieval.")
        words = query_text.lower().split()
        scored_chunks = []
        for chunk in self.chunks:
            score = 0
            content_lower = chunk["content"].lower()
            for word in words:
                if len(word) > 3 and word in content_lower:
                    score += 1
            if score > 0:
                scored_chunks.append((score, chunk))
        
        # Sort by score descending
        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored_chunks[:top_k]]

    def status(self) -> Dict[str, Any]:
        """Retrieval mode and corpus size, so the UI can state how answers are grounded."""
        if self.model is not None and self.index is not None:
            mode = "semantic_embeddings"
        elif self.chunks:
            mode = "keyword"
        else:
            mode = "unavailable"
        return {
            "mode": mode,
            "chunks": len(self.chunks),
            "embeddings_loaded": self.model is not None and self.index is not None,
        }

    def _load_fallback_data(self):
        """Loads chunks from text files directly for in-memory containment search if index build fails."""
        self.chunks = []
        if not os.path.exists(KB_DIR):
            return
        files = [f for f in os.listdir(KB_DIR) if f.endswith(".txt") or f.endswith(".md")]
        for filename in files:
            filepath = os.path.join(KB_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                paragraphs = content.split("\n\n")
                for para in paragraphs:
                    para = para.strip()
                    if para:
                        self.chunks.append({
                            "source": filename,
                            "content": para
                        })
            except Exception as e:
                logger.error(f"Fallback reading failed for {filename}: {e}")
        logger.info(f"Fallback loaded {len(self.chunks)} chunks in memory.")

# Global instance
rag_engine = RAGEngine()
