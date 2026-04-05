from django.shortcuts import render

def login_view(request):
    return render(request, 'login.html')

def register_view(request):
    return render(request, 'register.html')

def admin_view(request):
    return render(request, 'admin.html')

def committee_view(request):
    return render(request, 'committee.html')

def resident_view(request):
    return render(request, 'resident.html')