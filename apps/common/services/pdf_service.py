import re
import logging
from PyPDF2 import PdfReader
from common.utils.logger import get_logger

logger = get_logger(__name__)


class PDFExtractionError(Exception):
    pass


class PDFEmptyError(Exception):
    pass


def extract_pdf_text(pdf_file) -> str:
    """
    Extract text from a PDF file robustly.
    pdf_file: Django File/UploadedFile or file-like object
    Returns: Extracted text with page markers
    """
    try:
        reader = PdfReader(pdf_file)
        pages = []

        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                pages.append(f"--- Page {i + 1} ---\n{text}")

        if not pages:
            logger.warning("PDF contains no extractable text")
            raise PDFEmptyError("PDF contains no extractable text.")

        return "\n\n".join(pages)

    except PDFEmptyError:
        raise
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise PDFExtractionError(f"Failed to read PDF: {e}")


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list:
    """
    Split extracted PDF text into overlapping chunks for context retrieval.

    Args:
        text:       Full extracted bylaw text.
        chunk_size: Approximate characters per chunk (not tokens, but close enough
                    for LLM context windows — 800 chars ≈ 200 tokens).
        overlap:    Characters of overlap between consecutive chunks so that
                    sentences straddling a boundary are not lost.

    Returns:
        List of non-empty string chunks.
    """
    if not text or not text.strip():
        return []

    # Normalise whitespace but keep newlines as sentence separators
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)

    chunks = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)

        # Try to break at a sentence boundary (full-stop, newline)
        if end < length:
            for boundary in ('\n\n', '\n', '. ', '? ', '! '):
                boundary_pos = text.rfind(boundary, start, end)
                if boundary_pos > start + (chunk_size // 2):
                    end = boundary_pos + len(boundary)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Advance with overlap so context isn't lost at chunk edges
        start = max(start + 1, end - overlap)

    logger.debug(f"PDF chunked into {len(chunks)} chunks (size≈{chunk_size}, overlap={overlap})")
    return chunks
