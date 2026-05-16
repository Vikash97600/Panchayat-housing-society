from apps.bylaws.models import Bylaw
from common.utils.validators import validate_society_access
from common.utils.logger import get_logger

logger = get_logger(__name__)

class BylawNotFoundError(Exception):
    pass

class BylawTextEmptyError(Exception):
    pass

def get_bylaw_for_user(user, bylaw_id=None):
    """
    Retrieves the active bylaw for a user's society.
    Enforces multi-tenant isolation.
    """
    # Validates society and raises ValidationError if unauthorized
    society = validate_society_access(user)
    
    try:
        if bylaw_id:
            bylaw = Bylaw.objects.get(id=bylaw_id, society=society, is_active=True)
        else:
            bylaw = Bylaw.objects.filter(society=society, is_active=True).first()
            
        if not bylaw:
            raise BylawNotFoundError("No bylaw uploaded for your society.")
            
        if not bylaw.extracted_text:
            raise BylawTextEmptyError("Bylaw text extraction failed or is empty.")
            
        return bylaw
        
    except Bylaw.DoesNotExist:
        logger.warning(f"Bylaw {bylaw_id} not found for society {society.id}")
        raise BylawNotFoundError("No bylaw uploaded for your society.")
