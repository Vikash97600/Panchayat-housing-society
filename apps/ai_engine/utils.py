import logging
from io import BytesIO
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)


def extract_pdf_text(pdf_file) -> str:
    """
    Extract text from a PDF file.
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
            return ""
        
        return "\n\n".join(pages)
    
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise


AI_SUMMARY_PROMPT = """
You are an assistant for a housing society committee secretary.
Below are resident complaints submitted today.

Your task:
1. Group similar complaints together (e.g. all lift complaints → 1 point)
2. Summarise into 3 to 5 bullet points maximum
3. Mark urgent ones with [URGENT] prefix
4. Keep each bullet to 1 sentence
5. End with: "Total: X complaints from Y unique residents"

Today's complaints:
{complaints_json}
"""


BYLAW_SYSTEM_PROMPT = """You are a helpful assistant for {society_name} housing society.
Your job is to answer resident questions based ONLY on the official society bylaws provided below.

Rules:
1. Answer ONLY from the bylaw text. Do not use outside knowledge.
2. Always cite the specific rule number, section name, or page if mentioned.
3. Be friendly, clear, and concise (max 4 sentences).
4. If the answer is not in the bylaws, say exactly: "This topic is not covered in the uploaded bylaws. Please contact the committee directly."
5. Never make up rules.

Society bylaws:
---
{bylaw_text}
---
"""


MAINTENANCE_PROMPT = """
Explain this housing society maintenance expense breakdown in simple, friendly language for a resident (not an accountant).
Keep it to 2-3 sentences maximum. Mention the biggest expense.
Do not use jargon.

Month: {month}
Total: ₹{total}
Breakdown: {breakdown}
"""