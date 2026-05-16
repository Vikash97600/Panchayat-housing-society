from groq import Groq
from django.conf import settings
import logging
import time
import httpx

logger = logging.getLogger(__name__)

# Groq client (fixed for httpx compatibility issue)
client = Groq(
    api_key=settings.GROQ_API_KEY,
    http_client=httpx.Client()
)

SUPPORTED_FORMATS = [
    'audio/webm', 'audio/wav', 'audio/mpeg',
    'audio/mp4', 'audio/ogg', 'audio/flac',
    'audio/x-wav', 'audio/x-m4a', 'audio/mp3'
]


def transcribe_audio(audio_file) -> dict:
    """
    Transcribe an uploaded audio file using Groq Whisper (whisper-large-v3).
    Accepts a Django UploadedFile object.
    Returns dict with keys: transcript, language, duration.
    """

    # Read file properly
    audio_file.seek(0)
    audio_bytes = audio_file.read()
    filename = getattr(audio_file, 'name', 'recording.webm') or 'recording.webm'
    content_type = getattr(audio_file, 'content_type', 'audio/webm') or 'audio/webm'

    # Ensure correct extension
    if not any(filename.endswith(ext) for ext in ['.webm', '.wav', '.mp3', '.mp4', '.ogg', '.flac', '.m4a']):
        ext_map = {
            'audio/webm': '.webm',
            'audio/wav': '.wav',
            'audio/x-wav': '.wav',
            'audio/mpeg': '.mp3',
            'audio/mp3': '.mp3',
            'audio/mp4': '.mp4',
            'audio/x-m4a': '.m4a',
            'audio/ogg': '.ogg',
            'audio/flac': '.flac',
        }
        filename = 'recording' + ext_map.get(content_type, '.webm')

    file_tuple = (filename, audio_bytes, content_type)

    for attempt in range(3):
        try:
            logger.info(
                f"[VOICE] Sending to Groq Whisper (attempt {attempt + 1}), "
                f"file={filename}, size={len(audio_bytes)} bytes"
            )

            response = client.audio.transcriptions.create(
                file=file_tuple,
                model="whisper-large-v3",
                response_format="verbose_json",
                temperature=0.0,
            )

            transcript = (response.text or '').strip()
            language = getattr(response, 'language', 'unknown') or 'unknown'
            duration = round(float(getattr(response, 'duration', 0) or 0), 1)

            logger.info(
                f"[VOICE] Transcription success: '{transcript[:80]}...' lang={language}"
            )

            return {
                "transcript": transcript,
                "language": language,
                "duration": duration,
            }

        except Exception as e:
            logger.error(f"Groq Whisper error (attempt {attempt + 1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)  # exponential backoff
            else:
                raise Exception(f"Transcription failed after 3 attempts: {e}")


def validate_audio_file(audio_file) -> tuple:
    """Validate file before sending to Groq."""

    MAX_SIZE = 25 * 1024 * 1024  # 25 MB

    if audio_file.size > MAX_SIZE:
        return False, "File too large. Maximum size is 25 MB."

    if audio_file.content_type not in SUPPORTED_FORMATS:
        return False, (
            f"Unsupported format: {audio_file.content_type}. "
            f"Supported: webm, wav, mp3, mp4, ogg, flac"
        )

    return True, ""