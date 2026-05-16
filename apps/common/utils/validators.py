from django.core.exceptions import ValidationError
import os

def validate_pdf_file(pdf_file):
    """
    Validates that a file is a PDF and under the size limit.
    """
    if not pdf_file:
        raise ValidationError("No PDF file provided.")
        
    if pdf_file.size > 10 * 1024 * 1024:
        raise ValidationError("File size exceeds 10MB limit.")
        
    if not pdf_file.name.lower().endswith('.pdf'):
        raise ValidationError("Only PDF files are allowed.")
        
    return True

def validate_society_access(user, society_id=None):
    """
    Validates that the user has access to the specified society.
    Returns the society object or raises ValidationError.
    """
    if user.role == 'admin':
        if not society_id:
            raise ValidationError("Please select a society.")
        from apps.accounts.models import Society
        try:
            return Society.objects.get(id=society_id)
        except Society.DoesNotExist:
            raise ValidationError("Society not found.")
            
    if not user.society:
        raise ValidationError("User is not associated with any society.")
        
    if society_id and user.society.id != int(society_id):
        raise ValidationError("You do not have access to this society.")
        
    return user.society
