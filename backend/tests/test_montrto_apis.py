"""
MontRTO Backend API Tests
Tests all endpoints: auth, properties, missions, emergencies, quotes, provider stats
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

# Test tokens (created in MongoDB)
OWNER_TOKEN = "test_session_owner_1772220077730"
PROVIDER_TOKEN = "test_session_provider_1772220077730"

# Store created resource IDs for cleanup and verification
created_resources = {
    'properties': [],
    'missions': [],
    'emergencies': [],
    'quotes': []
}


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestHealthCheck:
    """Health check and service types"""

    def test_service_types(self, api_client):
        """GET /api/service-types - should return seeded service types"""
        response = api_client.get(f"{BASE_URL}/api/service-types")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have seeded service types"
        print(f"✓ Service types: {len(data)} types found")


class TestAuth:
    """Authentication endpoints"""

    def test_get_me_owner(self, api_client):
        """GET /api/auth/me - authenticated owner"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        user = response.json()
        assert "user_id" in user
        assert user["role"] == "owner"
        assert "email" in user
        print(f"✓ Owner auth working: {user['email']}")

    def test_get_me_provider(self, api_client):
        """GET /api/auth/me - authenticated provider"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        user = response.json()
        assert "user_id" in user
        assert user["role"] == "provider"
        print(f"✓ Provider auth working: {user['email']}")

    def test_get_me_no_auth(self, api_client):
        """GET /api/auth/me - no token should fail"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Auth required for /auth/me")


class TestUserRoleAndProfile:
    """User role setting and profile endpoints"""

    def test_get_profile_owner(self, api_client):
        """GET /api/users/profile - owner profile"""
        response = api_client.get(
            f"{BASE_URL}/api/users/profile",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        user = response.json()
        assert user["role"] == "owner"
        print(f"✓ Owner profile retrieved")

    def test_get_profile_provider(self, api_client):
        """GET /api/users/profile - provider profile with provider_profile"""
        response = api_client.get(
            f"{BASE_URL}/api/users/profile",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200
        user = response.json()
        assert user["role"] == "provider"
        assert "provider_profile" in user
        assert "available" in user["provider_profile"]
        print(f"✓ Provider profile retrieved with provider_profile")


class TestProperties:
    """Property CRUD operations"""

    def test_create_property(self, api_client):
        """POST /api/properties - create property"""
        payload = {
            "name": "TEST_Chalet Mont Blanc",
            "address": "123 Route de Morzine, 74110 Morzine",
            "property_type": "chalet",
            "ical_url": "https://example.com/ical/test.ics",
            "fixed_rate": 75.0,
            "access_code": "1234",
            "instructions": "Clé dans la boîte aux lettres"
        }
        response = api_client.post(
            f"{BASE_URL}/api/properties",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        property_data = response.json()
        assert "property_id" in property_data
        assert property_data["name"] == payload["name"]
        assert property_data["fixed_rate"] == payload["fixed_rate"]
        created_resources['properties'].append(property_data["property_id"])
        print(f"✓ Property created: {property_data['property_id']}")

    def test_get_properties(self, api_client):
        """GET /api/properties - list properties"""
        response = api_client.get(
            f"{BASE_URL}/api/properties",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        properties = response.json()
        assert isinstance(properties, list)
        assert len(properties) > 0, "Should have at least the property we created"
        print(f"✓ Properties list: {len(properties)} properties")

    def test_get_property_by_id(self, api_client):
        """GET /api/properties/{id} - get single property and verify persistence"""
        if not created_resources['properties']:
            pytest.skip("No property created yet")
        
        property_id = created_resources['properties'][0]
        response = api_client.get(
            f"{BASE_URL}/api/properties/{property_id}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        property_data = response.json()
        assert property_data["property_id"] == property_id
        assert property_data["name"] == "TEST_Chalet Mont Blanc"
        print(f"✓ Property retrieved and data persisted: {property_id}")

    def test_provider_cannot_access_properties(self, api_client):
        """GET /api/properties - provider should get 403"""
        response = api_client.get(
            f"{BASE_URL}/api/properties",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 403
        print("✓ Provider correctly blocked from properties")


class TestMissions:
    """Mission CRUD and application flow"""

    def test_create_mission(self, api_client):
        """POST /api/missions - create mission"""
        if not created_resources['properties']:
            pytest.skip("No property available")
        
        payload = {
            "property_id": created_resources['properties'][0],
            "mission_type": "cleaning",
            "mode": "fixed",
            "description": "TEST_Ménage après départ",
            "fixed_rate": 60.0,
            "scheduled_date": "2026-02-15T10:00:00Z"
        }
        response = api_client.post(
            f"{BASE_URL}/api/missions",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        mission = response.json()
        assert "mission_id" in mission
        assert mission["mission_type"] == "cleaning"
        assert mission["status"] == "pending"
        created_resources['missions'].append(mission["mission_id"])
        print(f"✓ Mission created: {mission['mission_id']}")

    def test_get_missions_owner(self, api_client):
        """GET /api/missions - owner sees own missions"""
        response = api_client.get(
            f"{BASE_URL}/api/missions",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        missions = response.json()
        assert isinstance(missions, list)
        print(f"✓ Owner missions: {len(missions)} missions")

    def test_get_missions_provider(self, api_client):
        """GET /api/missions - provider sees pending missions"""
        response = api_client.get(
            f"{BASE_URL}/api/missions",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200
        missions = response.json()
        assert isinstance(missions, list)
        print(f"✓ Provider missions: {len(missions)} available missions")

    def test_apply_to_mission(self, api_client):
        """POST /api/missions/{id}/apply - provider applies"""
        if not created_resources['missions']:
            pytest.skip("No mission available")
        
        mission_id = created_resources['missions'][0]
        payload = {
            "proposed_rate": 60.0,
            "message": "TEST_Je suis disponible"
        }
        response = api_client.post(
            f"{BASE_URL}/api/missions/{mission_id}/apply",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        # Fixed mode auto-assigns, so expect 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        application = response.json()
        assert "application_id" in application
        print(f"✓ Mission application submitted: {application['application_id']}")

    def test_get_mission_detail(self, api_client):
        """GET /api/missions/{id} - get mission with applications"""
        if not created_resources['missions']:
            pytest.skip("No mission available")
        
        mission_id = created_resources['missions'][0]
        response = api_client.get(
            f"{BASE_URL}/api/missions/{mission_id}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        mission = response.json()
        assert mission["mission_id"] == mission_id
        assert "applications" in mission
        print(f"✓ Mission detail retrieved with {len(mission['applications'])} applications")


class TestEmergency:
    """Emergency request and quote flow"""

    def test_create_emergency(self, api_client):
        """POST /api/emergency - owner creates emergency"""
        if not created_resources['properties']:
            pytest.skip("No property available")
        
        payload = {
            "property_id": created_resources['properties'][0],
            "service_type": "plumbing",
            "description": "TEST_Fuite d'eau urgente dans la salle de bain",
            "urgency_level": "critical"
        }
        response = api_client.post(
            f"{BASE_URL}/api/emergency",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        emergency = response.json()
        assert "request_id" in emergency
        assert emergency["service_type"] == "plumbing"
        assert emergency["status"] == "open"
        created_resources['emergencies'].append(emergency["request_id"])
        print(f"✓ Emergency created: {emergency['request_id']}")

    def test_get_emergencies(self, api_client):
        """GET /api/emergency - list emergencies"""
        response = api_client.get(
            f"{BASE_URL}/api/emergency",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        emergencies = response.json()
        assert isinstance(emergencies, list)
        print(f"✓ Emergencies list: {len(emergencies)} emergencies")

    def test_get_emergency_detail(self, api_client):
        """GET /api/emergency/{id} - get emergency detail"""
        if not created_resources['emergencies']:
            pytest.skip("No emergency available")
        
        emergency_id = created_resources['emergencies'][0]
        response = api_client.get(
            f"{BASE_URL}/api/emergency/{emergency_id}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        emergency = response.json()
        assert emergency["request_id"] == emergency_id
        assert "quotes" in emergency
        print(f"✓ Emergency detail retrieved")


class TestQuotes:
    """Quote creation and handling"""

    def test_create_quote(self, api_client):
        """POST /api/quotes - provider sends quote"""
        if not created_resources['emergencies']:
            pytest.skip("No emergency available")
        
        payload = {
            "emergency_request_id": created_resources['emergencies'][0],
            "lines": [
                {"description": "Main d'oeuvre", "quantity": 2, "unit_price": 50.0},
                {"description": "Pièces", "quantity": 1, "unit_price": 30.0}
            ],
            "tva_rate": 20.0
        }
        response = api_client.post(
            f"{BASE_URL}/api/quotes",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        quote = response.json()
        assert "quote_id" in quote
        assert quote["total_ht"] == 130.0
        assert quote["total_ttc"] == 156.0
        created_resources['quotes'].append(quote["quote_id"])
        print(f"✓ Quote created: {quote['quote_id']}, Total TTC: {quote['total_ttc']}€")


class TestProviderFeatures:
    """Provider-specific endpoints"""

    def test_toggle_availability(self, api_client):
        """PUT /api/provider/availability - toggle availability"""
        response = api_client.put(
            f"{BASE_URL}/api/provider/availability",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert isinstance(data["available"], bool)
        print(f"✓ Availability toggled to: {data['available']}")

    def test_provider_stats(self, api_client):
        """GET /api/provider/stats - get provider stats"""
        response = api_client.get(
            f"{BASE_URL}/api/provider/stats",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200
        stats = response.json()
        assert "total_earnings" in stats
        assert "completed_missions" in stats
        assert "in_progress_missions" in stats
        assert "pending_applications" in stats
        print(f"✓ Provider stats retrieved: {stats['completed_missions']} completed missions")


class TestOwnerDashboard:
    """Owner dashboard endpoint"""

    def test_owner_dashboard(self, api_client):
        """GET /api/dashboard/owner - get dashboard data"""
        response = api_client.get(
            f"{BASE_URL}/api/dashboard/owner",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        dashboard = response.json()
        assert "total_properties" in dashboard
        assert "total_missions" in dashboard
        assert "pending_missions" in dashboard
        assert "upcoming_missions" in dashboard
        assert isinstance(dashboard["upcoming_missions"], list)
        print(f"✓ Dashboard: {dashboard['total_properties']} properties, {dashboard['total_missions']} missions")


# Cleanup after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    def remove_test_data():
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        client = pymongo.MongoClient(mongo_url)
        db = client['test_database']
        
        # Clean up created resources
        if created_resources['properties']:
            db.properties.delete_many({"name": {"$regex": "^TEST_"}})
        if created_resources['missions']:
            db.missions.delete_many({"description": {"$regex": "^TEST_"}})
        if created_resources['emergencies']:
            db.emergency_requests.delete_many({"description": {"$regex": "^TEST_"}})
        
        print("\n✓ Test data cleaned up")
    
    request.addfinalizer(remove_test_data)
