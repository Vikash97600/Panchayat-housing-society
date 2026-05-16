import google.generativeai as genai
from django.conf import settings
import time
from common.utils.logger import get_logger

logger = get_logger(__name__)

class AIConfigurationError(Exception):
    pass

class AIQuotaExceededError(Exception):
    pass

class AIGenericError(Exception):
    pass

def call_gemini_service(system_prompt: str, user_message: str, max_tokens: int = 1024) -> str:
    """
    Call Google Gemini API with retry logic and granular exception handling.
    """
    api_key = getattr(settings, 'GEMINI_API_KEY', None)
    if not api_key or api_key == 'your-api-key-here':
        logger.error("Gemini API key is not configured or is set to default.")
        raise AIConfigurationError("AI service not configured by administrator.")

    try:
        genai.configure(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to configure Gemini: {e}")
        raise AIConfigurationError("Failed to configure AI service.")

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
            if not isinstance(user_message, str):
                user_message = str(user_message)
            response = model.generate_content(user_message)
            return response.text
        except Exception as e:
            error_msg = str(e).lower()
            
            if 'quota' in error_msg or '429' in error_msg:
                logger.error(f"Gemini API quota exceeded: {e}")
                raise AIQuotaExceededError("Gemini API quota exceeded.")
                
            if 'image' in error_msg and 'not support' in error_msg:
                logger.error(f"Gemini does not support image input: {e}")
                raise AIGenericError("I cannot process image inputs. Please provide text instead.")
            
            if 'api_key' in error_msg or 'invalid' in error_msg:
                logger.error(f"Gemini API key invalid: {e}")
                raise AIConfigurationError("AI service not configured correctly by administrator.")
                
            logger.error(f"Gemini API error (attempt {attempt+1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise AIGenericError(f"AI service unavailable after retries: {e}")
