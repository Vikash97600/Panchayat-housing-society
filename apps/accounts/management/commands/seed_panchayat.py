from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from django.db import transaction

from apps.accounts.models import Society, CustomUser
from apps.complaints.models import Complaint
from apps.services.models import Service, ServiceSlot
from apps.notices.models import Notice
from apps.finance.models import MaintenanceCategory, MaintenanceLedger, Due


class Command(BaseCommand):
    help = 'Seed Panchayat database with sample data'

    def handle(self, *args, **options):
        with transaction.atomic():
            society, created = Society.objects.get_or_create(
                name='Mahindra Splendour',
                defaults={
                    'address': 'Powai, Mumbai',
                    'city': 'Mumbai',
                    'state': 'Maharashtra',
                    'wing_count': 4,
                    'total_flats': 120,
                    'plan_type': 'premium',
                    'is_active': True
                }
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created society: {society.name}'))
            else:
                self.stdout.write(f'Society already exists: {society.name}')

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

            secretary, created = CustomUser.objects.get_or_create(
                email='secretary@splendour.com',
                defaults={
                    'username': 'secretary',
                    'first_name': 'Rajesh',
                    'last_name': 'Mehta',
                    'role': 'committee',
                    'society': society,
                    'phone': '9900000002',
                    'is_approved': True,
                    'is_active': True
                }
            )
            if created:
                secretary.set_password('Committee@123')
                secretary.save()
                self.stdout.write(self.style.SUCCESS('Created secretary user'))

            treasurer, created = CustomUser.objects.get_or_create(
                email='treasurer@splendour.com',
                defaults={
                    'username': 'treasurer',
                    'first_name': 'Sunita',
                    'last_name': 'Iyer',
                    'role': 'committee',
                    'society': society,
                    'phone': '9900000003',
                    'is_approved': True,
                    'is_active': True
                }
            )
            if created:
                treasurer.set_password('Committee@123')
                treasurer.save()
                self.stdout.write(self.style.SUCCESS('Created treasurer user'))

            residents = []
            for i in range(1, 6):
                flat = f'10{i}'
                resident, created = CustomUser.objects.get_or_create(
                    email=f'resident{i}@panchayat.com',
                    defaults={
                        'username': f'resident{i}',
                        'first_name': f'Resident',
                        'last_name': f'{i}',
                        'role': 'resident',
                        'society': society,
                        'flat_no': flat,
                        'wing': 'A',
                        'phone': f'99000000{i:02d}',
                        'is_approved': True,
                        'is_active': True
                    }
                )
                if created:
                    resident.set_password('Resident@123')
                    resident.save()
                residents.append(resident)

            self.stdout.write(self.style.SUCCESS(f'Created {len(residents)} residents'))

            services_data = [
                {'name': 'Plumber', 'description': 'Fix taps, pipes, drainage', 'vendor_name': 'Raju Plumbers', 'vendor_phone': '9800001111', 'price_per_slot': 0},
                {'name': 'Electrician', 'description': 'Wiring, switches, MCB', 'vendor_name': 'Sharma Electric', 'vendor_phone': '9800002222', 'price_per_slot': 0},
                {'name': 'Laundry', 'description': 'Pickup and delivery', 'vendor_name': 'Fresh Laundry', 'vendor_phone': '9800003333', 'price_per_slot': 150},
                {'name': 'Carpenter', 'description': 'Furniture and fixtures', 'vendor_name': 'Modi Carpentry', 'vendor_phone': '9800004444', 'price_per_slot': 200},
            ]

            for data in services_data:
                service, created = Service.objects.get_or_create(
                    name=data['name'],
                    society=society,
                    defaults=data
                )
                if created:
                    today = timezone.now().date()
                    for day in range(7):
                        date = today + timedelta(days=day)
                        ServiceSlot.objects.get_or_create(
                            service=service,
                            slot_date=date,
                            start_time='09:00',
                            defaults={
                                'end_time': '12:00',
                                'is_available': True
                            }
                        )
                        ServiceSlot.objects.get_or_create(
                            service=service,
                            slot_date=date,
                            start_time='14:00',
                            defaults={
                                'end_time': '18:00',
                                'is_available': True
                            }
                        )
                    self.stdout.write(self.style.SUCCESS(f'Created service: {service.name} with slots'))

            Complaint.objects.get_or_create(
                title='Water leakage in bathroom',
                society=society,
                submitted_by=residents[0],
                defaults={
                    'description': 'Water is leaking from the bathroom pipe',
                    'category': 'plumbing',
                    'priority': 'urgent',
                    'status': 'open'
                }
            )
            Complaint.objects.get_or_create(
                title='Lift not working in B-wing',
                society=society,
                submitted_by=residents[1],
                defaults={
                    'description': 'Lift has been malfunctioning since yesterday',
                    'category': 'lift',
                    'priority': 'medium',
                    'status': 'in_progress',
                    'assigned_to': secretary
                }
            )
            Complaint.objects.get_or_create(
                title='Parking issue',
                society=society,
                submitted_by=residents[2],
                defaults={
                    'description': 'Car parked in wrong slot',
                    'category': 'parking',
                    'priority': 'low',
                    'status': 'resolved'
                }
            )
            self.stdout.write(self.style.SUCCESS('Created sample complaints'))

            Notice.objects.get_or_create(
                title='AGM scheduled for May 15',
                society=society,
                posted_by=secretary,
                defaults={
                    'body': 'Annual General Meeting will be held in the community hall at 7 PM.',
                    'is_pinned': True
                }
            )
            Notice.objects.get_or_create(
                title='Lift B-wing under maintenance',
                society=society,
                posted_by=secretary,
                defaults={
                    'body': 'Lift in B-wing will be unavailable 9 AM to 1 PM on Saturday.',
                    'is_pinned': False
                }
            )
            self.stdout.write(self.style.SUCCESS('Created sample notices'))

            categories_data = [
                {'name': 'Staff salaries', 'description': 'Security and housekeeping'},
                {'name': 'Lift AMC', 'description': 'Annual maintenance contract for lifts'},
                {'name': 'Generator fuel', 'description': 'Monthly diesel for DG set'},
                {'name': 'Water charges', 'description': 'BMC water bill'},
                {'name': 'Sinking fund', 'description': 'Long-term repair corpus'},
                {'name': 'Garden and misc', 'description': 'Landscaping and sundry'},
            ]

            categories = []
            for data in categories_data:
                cat, created = MaintenanceCategory.objects.get_or_create(
                    name=data['name'],
                    society=society,
                    defaults=data
                )
                categories.append(cat)

            current_month = timezone.now().date().replace(day=1)
            for cat in categories:
                amount = 5000 + (categories.index(cat) * 1000)
                MaintenanceLedger.objects.get_or_create(
                    society=society,
                    category=cat,
                    month=current_month,
                    defaults={'amount': amount}
                )
            self.stdout.write(self.style.SUCCESS('Created maintenance categories and ledger'))

            maintenance_amount = 5000
            for resident in residents:
                Due.objects.get_or_create(
                    resident=resident,
                    society=society,
                    month=current_month,
                    defaults={'amount': maintenance_amount}
                )
            self.stdout.write(self.style.SUCCESS('Created dues for all residents'))

        self.stdout.write(self.style.SUCCESS('Database seeded successfully!'))