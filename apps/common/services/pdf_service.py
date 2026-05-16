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
