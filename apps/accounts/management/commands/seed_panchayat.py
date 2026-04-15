from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Society, CustomUser


class Command(BaseCommand):
    help = 'Seed database with only admin user'

    def handle(self, *args, **options):
        with transaction.atomic():

            # Create Society
            society, created = Society.objects.get_or_create(
                name='Mahindra Splendour',
                defaults={
                    'address': 'Powai, Mumbai',
                    'city': 'Mumbai',
                    'state': 'Maharashtra',
                    'wing_count': 4,
                    'total_flats': 120,
                    'plan_type': 'premium',
                    'is_active': False
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS(f'Created society: {society.name}'))
            else:
                self.stdout.write(f'Society already exists: {society.name}')

            # Create Admin User
            admin, created = CustomUser.objects.get_or_create(
                email='admin@panchayat.com',
                defaults={
                    'username': 'admin',
                    'first_name': 'Super',
                    'last_name': 'Admin',
                    'role': 'admin',
                    'society': society,
                    'phone': '9900000001',
                    'is_approved': True,
                    'is_active': True
                }
            )

            if created:
                admin.set_password('Admin@123')
                admin.save()
                self.stdout.write(self.style.SUCCESS('Created admin user'))
            else:
                self.stdout.write('Admin already exists')

        self.stdout.write(self.style.SUCCESS('Admin-only database seeded successfully!'))
