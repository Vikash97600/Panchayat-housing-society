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
            # Ensure we're only passing text, not images
            if isinstance(user_message, str):
                response = model.generate_content(user_message)
            else:
                # If non-string content, convert to string
                response = model.generate_content(str(user_message))
            return response.text
        except Exception as e:
            error_msg = str(e).lower()
            # Check if it's an image-related error
            if 'image' in error_msg and 'not support' in error_msg:
                logger.error(f"Gemini does not support image input: {e}")
                return "I cannot process image inputs. Please provide text instead."
            
            logger.error(f"Gemini API error (attempt {attempt+1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise Exception(f"Gemini unavailable after 3 attempts: {e}")