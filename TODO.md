# Panchayat Admin Services Edit Fix - TODO

## Approved Plan Steps (Breakdown):

### 1. Create TODO.md ✅ (Track progress)

### 2. Update templates/admin.html
- Add `is_active` checkbox to #service-form in #serviceModal
- Add `data-service-id=""` attribute to modal for easier JS access

### 3. Update static/js/admin.js (Primary fixes)
- Enhance `loadServices()`: Include is_active badge color/logic
- Update `editService(id)`: Better error handling, log API responses
- Add `is_active` field population/toggle in modal
- Improve `saveService()`: Include is_active in payload, confirm API prefix /api/, better toasts/reset
- Add onclick event delegation for dynamic buttons if needed

### 4. Minor backend: apps/services/serializers.py
- Ensure ServiceSerializer handles is_active explicitly for updates

### 5. Test & Verify
- `python manage.py runserver`
- Browser: F12 Network tab → verify /api/services/<id>/ GET, /api/services/<id>/update/ PUT succeed (200)
- Add service → Edit → Toggle active → Save → Table refreshes correctly
- Check DB/console for errors

### 6. Update TODO.md with progress
### 7. attempt_completion

**Progress: Steps 1-3 Complete**

- Templates/admin.html ✅ (added is_active checkbox)
- static/js/admin.js ✅ (is_active handling, populate/save/reset)
