"""
Emergency Payment Flow Tests
Tests Stripe checkout integration, commission calculation, and payment status flow
Covers: accept emergency, pay displacement, send quote, pay quote, complete emergency
"""
import pytest
import requests
import os
import time

# Get BASE_URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '')
if not BASE_URL:
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip()
                    break
    except:
        pass

if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

BASE_URL = BASE_URL.rstrip('/')

# Test tokens (update with fresh tokens from MongoDB)
OWNER_TOKEN = "test_session_owner_1772382979863"
PROVIDER_TOKEN = "test_session_provider_1772382979863"

# Store created resources
test_data = {
    'property_id': None,
    'emergency_id': None,
    'quote_id': None,
    'displacement_session_id': None,
    'quote_session_id': None
}


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestEmergencyPaymentFlow:
    """Test complete emergency payment flow with Stripe integration"""

    def test_01_create_property_for_emergency(self, api_client):
        """Setup: Create property for emergency testing"""
        payload = {
            "name": "TEST_PAYMENT_Property",
            "address": "123 Test Street, Morzine",
            "property_type": "chalet",
            "fixed_rate": 75.0
        }
        response = api_client.post(
            f"{BASE_URL}/api/properties",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to create property: {response.text}"
        property_data = response.json()
        test_data['property_id'] = property_data['property_id']
        print(f"✓ Test property created: {test_data['property_id']}")

    def test_02_create_emergency(self, api_client):
        """POST /api/emergency - Owner creates emergency"""
        assert test_data['property_id'], "Property not created"
        
        payload = {
            "property_id": test_data['property_id'],
            "service_type": "plumbing",
            "description": "TEST_PAYMENT_Urgent water leak",
            "urgency_level": "critical"
        }
        response = api_client.post(
            f"{BASE_URL}/api/emergency",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to create emergency: {response.text}"
        
        emergency = response.json()
        assert "request_id" in emergency
        assert emergency["status"] == "open"
        assert emergency["service_type"] == "plumbing"
        test_data['emergency_id'] = emergency['request_id']
        print(f"✓ Emergency created: {test_data['emergency_id']}, status=open")

    def test_03_provider_accept_emergency(self, api_client):
        """PUT /api/emergency/{id}/accept - Provider accepts with fees"""
        assert test_data['emergency_id'], "Emergency not created"
        
        payload = {
            "displacement_fee": 40.0,
            "diagnostic_fee": 30.0,
            "eta_minutes": 25
        }
        response = api_client.put(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}/accept",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to accept emergency: {response.text}"
        
        result = response.json()
        assert "displacement_amount" in result
        assert result["eta_minutes"] == 25
        
        # Verify commission calculation: provider quotes 70€ (40+30), owner pays 87.50€ (70/0.80)
        expected_owner_total = round(70.0 / 0.80, 2)
        assert result["displacement_amount"] == expected_owner_total, \
            f"Commission calculation wrong: expected {expected_owner_total}, got {result['displacement_amount']}"
        
        print(f"✓ Emergency accepted - Provider: 70€, Owner pays: {result['displacement_amount']}€")
        
        # Verify status changed to provider_accepted
        check_response = api_client.get(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert check_response.status_code == 200
        emergency = check_response.json()
        assert emergency["status"] == "provider_accepted", f"Status should be provider_accepted, got {emergency['status']}"
        print(f"✓ Status updated to provider_accepted")

    def test_04_verify_commission_hidden_in_response(self, api_client):
        """GET /api/emergency/{id} - Verify commission fields are HIDDEN"""
        assert test_data['emergency_id'], "Emergency not created"
        
        # Owner view
        response = api_client.get(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200
        emergency = response.json()
        
        # Check that commission fields are NOT exposed
        forbidden_fields = [
            "displacement_total_owner",
            "displacement_total_provider", 
            "quote_total_owner",
            "quote_total_provider"
        ]
        for field in forbidden_fields:
            assert field not in emergency, f"Commission field '{field}' should NOT be in response"
        
        # Check that display fields ARE present
        assert "displacement_amount_display" in emergency
        assert emergency["displacement_amount_display"] == 87.5  # 70 / 0.80
        print(f"✓ Commission fields hidden from owner, displacement_amount_display={emergency['displacement_amount_display']}€")
        
        # Provider view
        response = api_client.get(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}",
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200
        emergency = response.json()
        
        for field in forbidden_fields:
            assert field not in emergency, f"Commission field '{field}' should NOT be in response for provider"
        
        # Provider sees their gross amount
        assert emergency["displacement_amount_display"] == 70.0  # What provider quoted
        print(f"✓ Commission hidden from provider, displacement_amount_display={emergency['displacement_amount_display']}€")

    def test_05_create_stripe_checkout_for_displacement(self, api_client):
        """POST /api/emergency/{id}/pay-displacement - Create Stripe checkout session"""
        assert test_data['emergency_id'], "Emergency not created"
        
        payload = {
            "origin_url": "https://alpine-ops.preview.emergentagent.com"
        }
        response = api_client.post(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}/pay-displacement",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to create Stripe checkout: {response.text}"
        
        result = response.json()
        assert "checkout_url" in result
        assert "session_id" in result
        assert result["checkout_url"].startswith("https://checkout.stripe.com/") or "test" in result["checkout_url"]
        
        test_data['displacement_session_id'] = result['session_id']
        print(f"✓ Stripe checkout created for displacement: {result['session_id']}")
        print(f"  Checkout URL: {result['checkout_url'][:80]}...")

    def test_06_cannot_send_quote_before_payment(self, api_client):
        """POST /api/quotes - Should FAIL when status != displacement_paid"""
        assert test_data['emergency_id'], "Emergency not created"
        
        payload = {
            "emergency_request_id": test_data['emergency_id'],
            "lines": [
                {"description": "Labor", "quantity": 2, "unit_price": 50.0}
            ],
            "tva_rate": 20.0
        }
        response = api_client.post(
            f"{BASE_URL}/api/quotes",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}"
        error = response.json()
        assert "displacement must be paid" in error["detail"].lower(), \
            f"Error message should mention displacement payment: {error['detail']}"
        print(f"✓ Quote creation correctly blocked before displacement payment")

    def test_07_simulate_displacement_payment_success(self, api_client):
        """Simulate Stripe payment success by updating DB directly"""
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        client = pymongo.MongoClient(mongo_url)
        db = client['test_database']
        
        # Update emergency status to displacement_paid
        result = db.emergency_requests.update_one(
            {"request_id": test_data['emergency_id']},
            {"$set": {"status": "displacement_paid"}}
        )
        assert result.modified_count == 1, "Failed to update emergency status"
        print(f"✓ Simulated displacement payment success (status=displacement_paid)")
        
        # Verify status
        response = api_client.get(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        emergency = response.json()
        assert emergency["status"] == "displacement_paid"

    def test_08_provider_sends_quote(self, api_client):
        """POST /api/quotes - Provider sends repair quote after displacement paid"""
        assert test_data['emergency_id'], "Emergency not created"
        
        payload = {
            "emergency_request_id": test_data['emergency_id'],
            "lines": [
                {"description": "Labor - 2 hours", "quantity": 2, "unit_price": 50.0},
                {"description": "Replacement pipe", "quantity": 1, "unit_price": 30.0}
            ],
            "tva_rate": 20.0
        }
        response = api_client.post(
            f"{BASE_URL}/api/quotes",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to create quote: {response.text}"
        
        quote = response.json()
        assert "quote_id" in quote
        assert quote["total_ht"] == 130.0  # (2*50) + (1*30)
        assert quote["tva_amount"] == 26.0  # 130 * 0.20
        assert quote["total_ttc"] == 156.0  # 130 + 26
        
        # Verify commission fields are NOT in response
        assert "owner_pays" not in quote
        assert "platform_commission" not in quote
        
        test_data['quote_id'] = quote['quote_id']
        print(f"✓ Quote created: {quote['quote_id']}, Total TTC: {quote['total_ttc']}€")
        
        # Verify emergency status changed to quote_sent
        check_response = api_client.get(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        emergency = check_response.json()
        assert emergency["status"] == "quote_sent"
        
        # Verify owner sees correct amount with hidden commission
        # Provider quoted 156€, owner should pay 195€ (156 / 0.80)
        expected_owner_quote = round(156.0 / 0.80, 2)
        assert emergency["quote_amount_display"] == expected_owner_quote, \
            f"Owner quote display wrong: expected {expected_owner_quote}, got {emergency['quote_amount_display']}"
        print(f"✓ Status=quote_sent, Owner will pay: {emergency['quote_amount_display']}€ (Provider gets: 156€)")

    def test_09_create_stripe_checkout_for_quote(self, api_client):
        """POST /api/emergency/{id}/pay-quote - Create Stripe checkout for quote"""
        assert test_data['emergency_id'], "Emergency not created"
        
        payload = {
            "origin_url": "https://alpine-ops.preview.emergentagent.com"
        }
        response = api_client.post(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}/pay-quote",
            json=payload,
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to create quote checkout: {response.text}"
        
        result = response.json()
        assert "checkout_url" in result
        assert "session_id" in result
        
        test_data['quote_session_id'] = result['session_id']
        print(f"✓ Stripe checkout created for quote: {result['session_id']}")

    def test_10_simulate_quote_payment_success(self, api_client):
        """Simulate quote payment success"""
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        client = pymongo.MongoClient(mongo_url)
        db = client['test_database']
        
        # Update emergency status to quote_paid
        result = db.emergency_requests.update_one(
            {"request_id": test_data['emergency_id']},
            {"$set": {"status": "quote_paid"}}
        )
        assert result.modified_count == 1
        print(f"✓ Simulated quote payment success (status=quote_paid)")

    def test_11_provider_complete_emergency(self, api_client):
        """PUT /api/emergency/{id}/complete - Provider completes work"""
        assert test_data['emergency_id'], "Emergency not created"
        
        payload = {
            "before_photos": ["base64_photo_1"],
            "after_photos": ["base64_photo_2"]
        }
        response = api_client.put(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}/complete",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 200, f"Failed to complete emergency: {response.text}"
        
        result = response.json()
        assert "message" in result
        print(f"✓ Emergency completed successfully")
        
        # Verify status
        check_response = api_client.get(
            f"{BASE_URL}/api/emergency/{test_data['emergency_id']}",
            headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
        )
        emergency = check_response.json()
        assert emergency["status"] == "completed"
        assert len(emergency["before_photos"]) > 0
        assert len(emergency["after_photos"]) > 0
        print(f"✓ Status=completed, photos saved")

    def test_12_get_service_types(self, api_client):
        """GET /api/service-types - Verify seeded service types"""
        response = api_client.get(f"{BASE_URL}/api/service-types")
        assert response.status_code == 200
        
        types = response.json()
        assert isinstance(types, list)
        assert len(types) >= 5  # Should have plumbing, electrical, etc.
        
        # Check for emergency service types
        service_names = [t.get("name", "").lower() for t in types]
        assert any("plomb" in name for name in service_names), "Should have plumbing service"
        assert any("électr" in name or "electr" in name for name in service_names), "Should have electrical service"
        print(f"✓ Service types seeded: {len(types)} types available")


class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_cannot_pay_displacement_wrong_status(self, api_client):
        """Cannot pay displacement if not in provider_accepted status"""
        # Try to pay for a completed emergency
        if test_data['emergency_id']:
            payload = {"origin_url": "https://test.com"}
            response = api_client.post(
                f"{BASE_URL}/api/emergency/{test_data['emergency_id']}/pay-displacement",
                json=payload,
                headers={"Authorization": f"Bearer {OWNER_TOKEN}"}
            )
            assert response.status_code == 400
            print(f"✓ Payment blocked for wrong status")

    def test_provider_cannot_complete_before_quote_paid(self, api_client):
        """Provider cannot complete emergency before quote is paid"""
        # Create a new emergency in wrong state
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        client = pymongo.MongoClient(mongo_url)
        db = client['test_database']
        
        # Create emergency with quote_sent status
        test_emergency_id = f"test_edge_{int(time.time())}"
        db.emergency_requests.insert_one({
            "request_id": test_emergency_id,
            "property_id": test_data['property_id'],
            "owner_id": "test-owner",
            "service_type": "plumbing",
            "description": "Test",
            "status": "quote_sent",  # Wrong status
            "accepted_provider_id": "test-provider"
        })
        
        payload = {"before_photos": [], "after_photos": []}
        response = api_client.put(
            f"{BASE_URL}/api/emergency/{test_emergency_id}/complete",
            json=payload,
            headers={"Authorization": f"Bearer {PROVIDER_TOKEN}"}
        )
        assert response.status_code == 400
        print(f"✓ Complete blocked when quote not paid")
        
        # Cleanup
        db.emergency_requests.delete_one({"request_id": test_emergency_id})


# Cleanup
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(request):
    def cleanup():
        import pymongo
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        client = pymongo.MongoClient(mongo_url)
        db = client['test_database']
        
        # Clean up test data
        db.properties.delete_many({"name": {"$regex": "^TEST_PAYMENT"}})
        db.emergency_requests.delete_many({"description": {"$regex": "^TEST_PAYMENT"}})
        db.quotes.delete_many({"emergency_request_id": test_data.get('emergency_id', '')})
        db.payment_transactions.delete_many({"emergency_request_id": test_data.get('emergency_id', '')})
        
        print("\n✓ Test data cleaned up")
    
    request.addfinalizer(cleanup)
