import google.generativeai as genai
from django.conf import settings
import logging
import time

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.GEMINI_API_KEY)


def call_gemini(system_prompt: str, user_message: str,
                max_tokens: int = 1024) -> str:
    """
    Call Google Gemini API with retry logic.
    Same input/output signature as call_claude().
    """
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.3,
        ),
        system_instruction=system_prompt
    )

    for attempt in range(3):
        try:
            response = model.generate_content(user_message)
            return response.text
        except Exception as e:
            logger.error(f"Gemini API error (attempt {attempt+1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise Exception(f"Gemini unavailable after 3 attempts: {e}")