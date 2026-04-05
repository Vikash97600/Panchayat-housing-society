from groq import Groq
from django.conf import settings
import logging
import time

logger = logging.getLogger(__name__)

client = Groq(api_key=settings.GROQ_API_KEY)

SUPPORTED_FORMATS = [
    'audio/webm', 'audio/wav', 'audio/mpeg',
    'audio/mp4', 'audio/ogg', 'audio/flac',
    'audio/x-wav', 'audio/x-m4a'
]


def transcribe_audio(audio_file) -> dict:
    """
    Drop-in replacement for OpenAI Whisper transcribe_audio().
    Uses Groq's free whisper-large-v3 model.
    """
    file_tuple = (
        audio_file.name,
        audio_file,
        audio_file.content_type or 'audio/webm'
    )

    for attempt in range(3):
        try:
            response = client.audio.transcriptions.create(
                file=file_tuple,
                model="whisper-large-v3",
                response_format="verbose_json",
                temperature=0.0
            )
            return {
                "transcript": response.text.strip(),
                "language": getattr(response, 'language', 'unknown'),
                "duration": round(getattr(response, 'duration', 0), 1)
            }
        except Exception as e:
            logger.error(f"Groq Whisper error (attempt {attempt+1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise Exception(f"Transcription failed after 3 attempts: {e}")


def validate_audio_file(audio_file) -> tuple[bool, str]:
    """Validate file before sending to Groq."""
    MAX_SIZE = 25 * 1024 * 1024

    if audio_file.size > MAX_SIZE:
        return False, "File too large. Maximum size is 25 MB."

    if audio_file.content_type not in SUPPORTED_FORMATS:
        return False, f"Unsupported format: {audio_file.content_type}. Supported: webm, wav, mp3, mp4, ogg, flac"

    return True, ""