from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import httpx
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    created_at: Optional[str] = None

class RoleUpdate(BaseModel):
    role: str  # "owner" or "provider"

class PropertyCreate(BaseModel):
    name: str
    address: str
    property_type: str = "apartment"  # apartment, chalet, studio
    ical_url: Optional[str] = None
    access_code: Optional[str] = None
    instructions: Optional[str] = None
    fixed_rate: Optional[float] = None
    linen_instructions: Optional[str] = None
    deposit_location: Optional[str] = None

class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    property_type: Optional[str] = None
    ical_url: Optional[str] = None
    access_code: Optional[str] = None
    instructions: Optional[str] = None
    fixed_rate: Optional[float] = None
    linen_instructions: Optional[str] = None
    deposit_location: Optional[str] = None

class MissionCreate(BaseModel):
    property_id: str
    mission_type: str = "cleaning"  # cleaning, linen, maintenance
    description: Optional[str] = None
    mode: str = "fixed"  # fixed or bidding
    scheduled_date: Optional[str] = None
    fixed_rate: Optional[float] = None

class MissionApplicationCreate(BaseModel):
    proposed_rate: Optional[float] = None
    message: Optional[str] = None

class EmergencyCreate(BaseModel):
    property_id: str
    service_type: str  # plumbing, electrical, locksmith, jacuzzi, repair
    description: str
    urgency_level: str = "high"  # high, critical

class EmergencyAccept(BaseModel):
    displacement_fee: float  # Provider's displacement fee
    diagnostic_fee: float  # Provider's diagnostic fee
    eta_minutes: int  # Estimated time of arrival in minutes

class QuoteCreate(BaseModel):
    emergency_request_id: str
    lines: List[Dict[str, Any]]  # [{description, quantity, unit_price}]
    tva_rate: float = 20.0

class QuoteAction(BaseModel):
    action: str  # "accept" or "reject"

class ProviderProfileUpdate(BaseModel):
    specialties: Optional[List[str]] = None
    zone: Optional[str] = None
    bio: Optional[str] = None
    hourly_rate: Optional[float] = None

class EmergencyCompleteRequest(BaseModel):
    before_photos: List[str] = []  # base64 encoded photos
    after_photos: List[str] = []

# Platform commission rates (HIDDEN from users)
EMERGENCY_COMMISSION_RATE = 0.20  # 20%
CLEANING_COMMISSION_RATE = 0.10  # 10%

# ============== AUTH HELPERS ==============

async def get_current_user(request: Request) -> dict:
    """Extract user from session token (cookie or Authorization header)."""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Convert datetime to string for JSON serialization
    if isinstance(user.get("created_at"), datetime):
        user["created_at"] = user["created_at"].isoformat()

    return user

async def get_optional_user(request: Request) -> Optional[dict]:
    """Try to get user, return None if not authenticated."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Emergent session_id for app session."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    # Call Emergent Auth to get user data
    async with httpx.AsyncClient() as client_http:
        auth_resp = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    if auth_resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")

    auth_data = auth_resp.json()
    email = auth_data["email"]
    name = auth_data.get("name", "")
    picture = auth_data.get("picture", "")

    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": None,
            "created_at": datetime.now(timezone.utc)
        })

    # Create session
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })

    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        path="/",
        secure=True,
        httponly=True,
        samesite="none",
        max_age=7 * 24 * 3600
    )

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if isinstance(user.get("created_at"), datetime):
        user["created_at"] = user["created_at"].isoformat()

    return {"session_token": session_token, "user": user}


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}


# ============== USER ENDPOINTS ==============

@api_router.put("/users/role")
async def update_role(data: RoleUpdate, user: dict = Depends(get_current_user)):
    if data.role not in ("owner", "provider"):
        raise HTTPException(status_code=400, detail="Role must be 'owner' or 'provider'")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": data.role}})

    if data.role == "provider":
        existing = await db.provider_profiles.find_one({"provider_id": user["user_id"]}, {"_id": 0})
        if not existing:
            await db.provider_profiles.insert_one({
                "provider_id": user["user_id"],
                "specialties": [],
                "zone": "Morzine",
                "available": False,
                "rating": 0,
                "total_reviews": 0,
                "bio": "",
                "hourly_rate": 0,
                "total_earnings": 0,
                "created_at": datetime.now(timezone.utc)
            })

    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if isinstance(updated.get("created_at"), datetime):
        updated["created_at"] = updated["created_at"].isoformat()
    return updated


@api_router.get("/users/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    if user.get("role") == "provider":
        profile = await db.provider_profiles.find_one({"provider_id": user["user_id"]}, {"_id": 0})
        if profile:
            if isinstance(profile.get("created_at"), datetime):
                profile["created_at"] = profile["created_at"].isoformat()
            user["provider_profile"] = profile
    return user


@api_router.put("/users/provider-profile")
async def update_provider_profile(data: ProviderProfileUpdate, user: dict = Depends(get_current_user)):
    if user.get("role") != "provider":
        raise HTTPException(status_code=403, detail="Only providers can update provider profile")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        await db.provider_profiles.update_one({"provider_id": user["user_id"]}, {"$set": update_data})
    profile = await db.provider_profiles.find_one({"provider_id": user["user_id"]}, {"_id": 0})
    if isinstance(profile.get("created_at"), datetime):
        profile["created_at"] = profile["created_at"].isoformat()
    return profile


# ============== PROPERTIES ENDPOINTS ==============

@api_router.get("/properties")
async def list_properties(user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can access properties")
    properties = await db.properties.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(100)
    for p in properties:
        for field in ["created_at", "last_sync"]:
            if isinstance(p.get(field), datetime):
                p[field] = p[field].isoformat()
    return properties


@api_router.post("/properties")
async def create_property(data: PropertyCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create properties")
    property_id = f"prop_{uuid.uuid4().hex[:12]}"
    prop = {
        "property_id": property_id,
        "owner_id": user["user_id"],
        "name": data.name,
        "address": data.address,
        "property_type": data.property_type,
        "ical_url": data.ical_url,
        "access_code": data.access_code,
        "instructions": data.instructions,
        "fixed_rate": data.fixed_rate,
        "linen_instructions": data.linen_instructions,
        "deposit_location": data.deposit_location,
        "created_at": datetime.now(timezone.utc),
        "last_sync": None,
        "reservation_count": 0
    }
    await db.properties.insert_one(prop)
    prop.pop("_id", None)
    if isinstance(prop.get("created_at"), datetime):
        prop["created_at"] = prop["created_at"].isoformat()
    return prop


@api_router.get("/properties/{property_id}")
async def get_property(property_id: str, user: dict = Depends(get_current_user)):
    prop = await db.properties.find_one({"property_id": property_id, "owner_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for field in ["created_at", "last_sync"]:
        if isinstance(prop.get(field), datetime):
            prop[field] = prop[field].isoformat()
    return prop


@api_router.put("/properties/{property_id}")
async def update_property(property_id: str, data: PropertyUpdate, user: dict = Depends(get_current_user)):
    prop = await db.properties.find_one({"property_id": property_id, "owner_id": user["user_id"]})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        await db.properties.update_one({"property_id": property_id}, {"$set": update_data})
    updated = await db.properties.find_one({"property_id": property_id}, {"_id": 0})
    for field in ["created_at", "last_sync"]:
        if isinstance(updated.get(field), datetime):
            updated[field] = updated[field].isoformat()
    return updated


@api_router.delete("/properties/{property_id}")
async def delete_property(property_id: str, user: dict = Depends(get_current_user)):
    result = await db.properties.delete_one({"property_id": property_id, "owner_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")
    return {"message": "Property deleted"}


@api_router.post("/properties/{property_id}/sync-ical")
async def sync_ical(property_id: str, user: dict = Depends(get_current_user)):
    """Sync reservations from iCal URL."""
    prop = await db.properties.find_one({"property_id": property_id, "owner_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if not prop.get("ical_url"):
        raise HTTPException(status_code=400, detail="No iCal URL configured")

    try:
        from icalendar import Calendar
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.get(prop["ical_url"], timeout=30)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch iCal feed")

        cal = Calendar.from_ical(resp.text)
        new_reservations = 0

        for component in cal.walk():
            if component.name == "VEVENT":
                dtstart = component.get("DTSTART")
                dtend = component.get("DTEND")
                summary = str(component.get("SUMMARY", "Reservation"))
                uid = str(component.get("UID", uuid.uuid4().hex))

                if dtstart and dtend:
                    check_in = dtstart.dt if hasattr(dtstart, 'dt') else dtstart
                    check_out = dtend.dt if hasattr(dtend, 'dt') else dtend

                    # Convert to datetime if date
                    if not isinstance(check_in, datetime):
                        check_in = datetime.combine(check_in, datetime.min.time())
                    if not isinstance(check_out, datetime):
                        check_out = datetime.combine(check_out, datetime.min.time())

                    # Make timezone-aware
                    if check_in.tzinfo is None:
                        check_in = check_in.replace(tzinfo=timezone.utc)
                    if check_out.tzinfo is None:
                        check_out = check_out.replace(tzinfo=timezone.utc)

                    # Check if reservation already exists
                    existing = await db.reservations.find_one({
                        "property_id": property_id,
                        "ical_uid": uid
                    })

                    if not existing:
                        reservation_id = f"res_{uuid.uuid4().hex[:12]}"
                        await db.reservations.insert_one({
                            "reservation_id": reservation_id,
                            "property_id": property_id,
                            "owner_id": user["user_id"],
                            "guest_name": summary,
                            "check_in": check_in,
                            "check_out": check_out,
                            "source": "ical",
                            "ical_uid": uid,
                            "created_at": datetime.now(timezone.utc)
                        })
                        new_reservations += 1

                        # Auto-create cleaning mission for check-out
                        mission_id = f"mis_{uuid.uuid4().hex[:12]}"
                        rate = prop.get("fixed_rate", 50.0)
                        await db.missions.insert_one({
                            "mission_id": mission_id,
                            "property_id": property_id,
                            "owner_id": user["user_id"],
                            "reservation_id": reservation_id,
                            "mission_type": "cleaning",
                            "status": "pending",
                            "description": f"Ménage après départ - {summary}",
                            "mode": "fixed" if rate else "bidding",
                            "fixed_rate": rate,
                            "scheduled_date": check_out.isoformat(),
                            "assigned_provider_id": None,
                            "applications_count": 0,
                            "created_at": datetime.now(timezone.utc)
                        })

        await db.properties.update_one(
            {"property_id": property_id},
            {"$set": {"last_sync": datetime.now(timezone.utc), "reservation_count": await db.reservations.count_documents({"property_id": property_id})}}
        )

        return {"message": f"Sync complete. {new_reservations} new reservations imported.", "new_reservations": new_reservations}

    except Exception as e:
        logger.error(f"iCal sync error: {e}")
        raise HTTPException(status_code=400, detail=f"iCal sync failed: {str(e)}")


# ============== RESERVATIONS ENDPOINTS ==============

@api_router.get("/reservations")
async def list_reservations(property_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"owner_id": user["user_id"]}
    if property_id:
        query["property_id"] = property_id
    reservations = await db.reservations.find(query, {"_id": 0}).sort("check_in", -1).to_list(100)
    for r in reservations:
        for field in ["check_in", "check_out", "created_at"]:
            if isinstance(r.get(field), datetime):
                r[field] = r[field].isoformat()
    return reservations


# ============== MISSIONS ENDPOINTS ==============

@api_router.get("/missions")
async def list_missions(
    status: Optional[str] = None,
    mission_type: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    if user.get("role") == "owner":
        query: Dict[str, Any] = {"owner_id": user["user_id"]}
    elif user.get("role") == "provider":
        # Providers see pending missions in their zone or assigned to them
        query = {"$or": [
            {"status": "pending"},
            {"assigned_provider_id": user["user_id"]}
        ]}
    else:
        return []

    if status:
        query["status"] = status
    if mission_type:
        query["mission_type"] = mission_type

    missions = await db.missions.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Enrich with property info
    for m in missions:
        prop = await db.properties.find_one({"property_id": m.get("property_id")}, {"_id": 0, "name": 1, "address": 1})
        if prop:
            m["property_name"] = prop.get("name", "")
            m["property_address"] = prop.get("address", "")

        # Include access info only for assigned provider
        if user.get("role") == "provider" and m.get("assigned_provider_id") == user["user_id"] and m.get("status") in ("assigned", "in_progress"):
            full_prop = await db.properties.find_one({"property_id": m.get("property_id")}, {"_id": 0})
            if full_prop:
                m["access_code"] = full_prop.get("access_code")
                m["instructions"] = full_prop.get("instructions")
                m["deposit_location"] = full_prop.get("deposit_location")

        for field in ["created_at", "scheduled_date", "started_at", "completed_at"]:
            if isinstance(m.get(field), datetime):
                m[field] = m[field].isoformat()

    return missions


@api_router.post("/missions")
async def create_mission(data: MissionCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create missions")

    prop = await db.properties.find_one({"property_id": data.property_id, "owner_id": user["user_id"]})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    mission_id = f"mis_{uuid.uuid4().hex[:12]}"
    rate = data.fixed_rate or prop.get("fixed_rate")
    mission = {
        "mission_id": mission_id,
        "property_id": data.property_id,
        "owner_id": user["user_id"],
        "reservation_id": None,
        "mission_type": data.mission_type,
        "status": "pending",
        "description": data.description or f"Mission {data.mission_type}",
        "mode": data.mode,
        "fixed_rate": rate,
        "scheduled_date": data.scheduled_date,
        "assigned_provider_id": None,
        "applications_count": 0,
        "created_at": datetime.now(timezone.utc)
    }
    await db.missions.insert_one(mission)
    mission.pop("_id", None)
    for field in ["created_at"]:
        if isinstance(mission.get(field), datetime):
            mission[field] = mission[field].isoformat()

    # Create notification for available providers
    await _notify_providers("mission", f"Nouvelle mission disponible: {data.mission_type}", mission_id)

    return mission


@api_router.get("/missions/{mission_id}")
async def get_mission(mission_id: str, user: dict = Depends(get_current_user)):
    mission = await db.missions.find_one({"mission_id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    # Enrich with property info
    prop = await db.properties.find_one({"property_id": mission.get("property_id")}, {"_id": 0})
    if prop:
        mission["property_name"] = prop.get("name", "")
        mission["property_address"] = prop.get("address", "")

        if user.get("role") == "provider" and mission.get("assigned_provider_id") == user["user_id"]:
            mission["access_code"] = prop.get("access_code")
            mission["instructions"] = prop.get("instructions")
            mission["deposit_location"] = prop.get("deposit_location")
            mission["linen_instructions"] = prop.get("linen_instructions")

    # Get applications
    apps = await db.mission_applications.find({"mission_id": mission_id}, {"_id": 0}).to_list(50)
    for a in apps:
        provider = await db.users.find_one({"user_id": a.get("provider_id")}, {"_id": 0, "name": 1, "picture": 1})
        if provider:
            a["provider_name"] = provider.get("name", "")
            a["provider_picture"] = provider.get("picture", "")
        profile = await db.provider_profiles.find_one({"provider_id": a.get("provider_id")}, {"_id": 0, "rating": 1, "total_reviews": 1})
        if profile:
            a["provider_rating"] = profile.get("rating", 0)
            a["provider_reviews"] = profile.get("total_reviews", 0)
        for field in ["created_at"]:
            if isinstance(a.get(field), datetime):
                a[field] = a[field].isoformat()
    mission["applications"] = apps

    for field in ["created_at", "scheduled_date", "started_at", "completed_at"]:
        if isinstance(mission.get(field), datetime):
            mission[field] = mission[field].isoformat()

    return mission


@api_router.post("/missions/{mission_id}/apply")
async def apply_to_mission(mission_id: str, data: MissionApplicationCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "provider":
        raise HTTPException(status_code=403, detail="Only providers can apply")

    mission = await db.missions.find_one({"mission_id": mission_id})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Mission is not accepting applications")

    # Check if already applied
    existing = await db.mission_applications.find_one({"mission_id": mission_id, "provider_id": user["user_id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already applied")

    app_id = f"app_{uuid.uuid4().hex[:12]}"
    application = {
        "application_id": app_id,
        "mission_id": mission_id,
        "provider_id": user["user_id"],
        "proposed_rate": data.proposed_rate or mission.get("fixed_rate"),
        "message": data.message or "",
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    await db.mission_applications.insert_one(application)
    await db.missions.update_one({"mission_id": mission_id}, {"$inc": {"applications_count": 1}})

    application.pop("_id", None)
    if isinstance(application.get("created_at"), datetime):
        application["created_at"] = application["created_at"].isoformat()

    # If fixed rate mode, auto-assign first applicant
    if mission.get("mode") == "fixed":
        await _assign_provider(mission_id, user["user_id"], application["proposed_rate"])
        application["status"] = "accepted"

    return application


@api_router.put("/missions/{mission_id}/applications/{application_id}")
async def handle_application(mission_id: str, application_id: str, action: QuoteAction, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage applications")

    app_doc = await db.mission_applications.find_one({"application_id": application_id, "mission_id": mission_id})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Application not found")

    if action.action == "accept":
        await db.mission_applications.update_one({"application_id": application_id}, {"$set": {"status": "accepted"}})
        # Reject all others
        await db.mission_applications.update_many(
            {"mission_id": mission_id, "application_id": {"$ne": application_id}},
            {"$set": {"status": "rejected"}}
        )
        await _assign_provider(mission_id, app_doc["provider_id"], app_doc.get("proposed_rate"))
    elif action.action == "reject":
        await db.mission_applications.update_one({"application_id": application_id}, {"$set": {"status": "rejected"}})

    return {"message": f"Application {action.action}ed"}


@api_router.put("/missions/{mission_id}/start")
async def start_mission(mission_id: str, user: dict = Depends(get_current_user)):
    mission = await db.missions.find_one({"mission_id": mission_id, "assigned_provider_id": user["user_id"]})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found or not assigned to you")
    if mission.get("status") != "assigned":
        raise HTTPException(status_code=400, detail="Mission must be in 'assigned' status to start")

    await db.missions.update_one(
        {"mission_id": mission_id},
        {"$set": {"status": "in_progress", "started_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Mission started"}


@api_router.put("/missions/{mission_id}/complete")
async def complete_mission(mission_id: str, user: dict = Depends(get_current_user)):
    mission = await db.missions.find_one({"mission_id": mission_id, "assigned_provider_id": user["user_id"]})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found or not assigned to you")
    if mission.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail="Mission must be in progress to complete")

    await db.missions.update_one(
        {"mission_id": mission_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc)}}
    )

    # Update provider earnings
    rate = mission.get("fixed_rate", 0)
    if rate:
        await db.provider_profiles.update_one(
            {"provider_id": user["user_id"]},
            {"$inc": {"total_earnings": rate}}
        )

    return {"message": "Mission completed"}


# ============== EMERGENCY ENDPOINTS ==============

@api_router.post("/emergency")
async def create_emergency(data: EmergencyCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create emergency requests")

    prop = await db.properties.find_one({"property_id": data.property_id, "owner_id": user["user_id"]})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    request_id = f"emer_{uuid.uuid4().hex[:12]}"
    emergency = {
        "request_id": request_id,
        "property_id": data.property_id,
        "owner_id": user["user_id"],
        "service_type": data.service_type,
        "description": data.description,
        "urgency_level": data.urgency_level,
        "status": "open",
        "quotes_count": 0,
        "created_at": datetime.now(timezone.utc)
    }
    await db.emergency_requests.insert_one(emergency)
    emergency.pop("_id", None)
    if isinstance(emergency.get("created_at"), datetime):
        emergency["created_at"] = emergency["created_at"].isoformat()

    await _notify_providers("emergency", f"Urgence {data.service_type}: {data.description[:50]}", request_id)
    await _mock_email(user["email"], "Urgence créée", f"Votre demande d'urgence ({data.service_type}) a été envoyée aux techniciens de la zone.")

    return emergency


@api_router.get("/emergency")
async def list_emergency(user: dict = Depends(get_current_user)):
    if user.get("role") == "owner":
        query = {"owner_id": user["user_id"]}
    else:
        query = {"status": "open"}

    requests = await db.emergency_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in requests:
        prop = await db.properties.find_one({"property_id": r.get("property_id")}, {"_id": 0, "name": 1, "address": 1})
        if prop:
            r["property_name"] = prop.get("name", "")
            r["property_address"] = prop.get("address", "")
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return requests


@api_router.get("/emergency/{request_id}")
async def get_emergency(request_id: str, user: dict = Depends(get_current_user)):
    emergency = await db.emergency_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency request not found")

    prop = await db.properties.find_one({"property_id": emergency.get("property_id")}, {"_id": 0})
    if prop:
        emergency["property_name"] = prop.get("name", "")
        emergency["property_address"] = prop.get("address", "")

    # Get quotes
    quotes = await db.quotes.find({"emergency_request_id": request_id}, {"_id": 0}).to_list(50)
    for q in quotes:
        provider = await db.users.find_one({"user_id": q.get("provider_id")}, {"_id": 0, "name": 1, "picture": 1})
        if provider:
            q["provider_name"] = provider.get("name", "")
            q["provider_picture"] = provider.get("picture", "")
        if isinstance(q.get("created_at"), datetime):
            q["created_at"] = q["created_at"].isoformat()
    emergency["quotes"] = quotes

    if isinstance(emergency.get("created_at"), datetime):
        emergency["created_at"] = emergency["created_at"].isoformat()

    return emergency


# ============== QUOTES ENDPOINTS ==============

@api_router.post("/quotes")
async def create_quote(data: QuoteCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "provider":
        raise HTTPException(status_code=403, detail="Only providers can send quotes")

    emergency = await db.emergency_requests.find_one({"request_id": data.emergency_request_id})
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency request not found")

    # Calculate totals
    total_ht = sum(line.get("quantity", 1) * line.get("unit_price", 0) for line in data.lines)
    tva_amount = total_ht * (data.tva_rate / 100)
    total_ttc = total_ht + tva_amount

    quote_id = f"quote_{uuid.uuid4().hex[:12]}"
    quote = {
        "quote_id": quote_id,
        "emergency_request_id": data.emergency_request_id,
        "provider_id": user["user_id"],
        "lines": data.lines,
        "total_ht": round(total_ht, 2),
        "tva_rate": data.tva_rate,
        "tva_amount": round(tva_amount, 2),
        "total_ttc": round(total_ttc, 2),
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    await db.quotes.insert_one(quote)
    quote.pop("_id", None)
    if isinstance(quote.get("created_at"), datetime):
        quote["created_at"] = quote["created_at"].isoformat()

    await db.emergency_requests.update_one(
        {"request_id": data.emergency_request_id},
        {"$inc": {"quotes_count": 1}}
    )

    return quote


@api_router.put("/quotes/{quote_id}")
async def handle_quote(quote_id: str, data: QuoteAction, user: dict = Depends(get_current_user)):
    quote = await db.quotes.find_one({"quote_id": quote_id})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if data.action == "accept":
        await db.quotes.update_one({"quote_id": quote_id}, {"$set": {"status": "accepted"}})
        # Reject all other quotes for this emergency
        await db.quotes.update_many(
            {"emergency_request_id": quote["emergency_request_id"], "quote_id": {"$ne": quote_id}},
            {"$set": {"status": "rejected"}}
        )
        await db.emergency_requests.update_one(
            {"request_id": quote["emergency_request_id"]},
            {"$set": {"status": "accepted", "accepted_quote_id": quote_id, "assigned_provider_id": quote["provider_id"]}}
        )
        await _mock_email("provider@example.com", "Devis accepté", f"Votre devis de {quote.get('total_ttc')}€ a été accepté.")
    elif data.action == "reject":
        await db.quotes.update_one({"quote_id": quote_id}, {"$set": {"status": "rejected"}})

    return {"message": f"Quote {data.action}ed"}


# ============== SERVICE TYPES ==============

@api_router.get("/service-types")
async def list_service_types():
    types = await db.service_types.find({}, {"_id": 0}).to_list(50)
    return types


# ============== PROVIDER ENDPOINTS ==============

@api_router.put("/provider/availability")
async def toggle_availability(user: dict = Depends(get_current_user)):
    if user.get("role") != "provider":
        raise HTTPException(status_code=403, detail="Only providers")
    profile = await db.provider_profiles.find_one({"provider_id": user["user_id"]})
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    new_status = not profile.get("available", False)
    await db.provider_profiles.update_one({"provider_id": user["user_id"]}, {"$set": {"available": new_status}})
    return {"available": new_status}


@api_router.get("/provider/stats")
async def provider_stats(user: dict = Depends(get_current_user)):
    if user.get("role") != "provider":
        raise HTTPException(status_code=403, detail="Only providers")

    profile = await db.provider_profiles.find_one({"provider_id": user["user_id"]}, {"_id": 0})
    completed = await db.missions.count_documents({"assigned_provider_id": user["user_id"], "status": "completed"})
    in_progress = await db.missions.count_documents({"assigned_provider_id": user["user_id"], "status": "in_progress"})
    pending_apps = await db.mission_applications.count_documents({"provider_id": user["user_id"], "status": "pending"})

    # Recent completed missions
    recent = await db.missions.find(
        {"assigned_provider_id": user["user_id"], "status": "completed"},
        {"_id": 0}
    ).sort("completed_at", -1).to_list(10)

    for m in recent:
        for field in ["created_at", "scheduled_date", "started_at", "completed_at"]:
            if isinstance(m.get(field), datetime):
                m[field] = m[field].isoformat()

    return {
        "total_earnings": profile.get("total_earnings", 0) if profile else 0,
        "completed_missions": completed,
        "in_progress_missions": in_progress,
        "pending_applications": pending_apps,
        "rating": profile.get("rating", 0) if profile else 0,
        "total_reviews": profile.get("total_reviews", 0) if profile else 0,
        "recent_missions": recent
    }


# ============== NOTIFICATIONS ==============

@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for n in notifs:
        if isinstance(n.get("created_at"), datetime):
            n["created_at"] = n["created_at"].isoformat()
    return notifs


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user["user_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}


# ============== DASHBOARD STATS ==============

@api_router.get("/dashboard/owner")
async def owner_dashboard(user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners")

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)

    total_properties = await db.properties.count_documents({"owner_id": user["user_id"]})
    total_missions = await db.missions.count_documents({"owner_id": user["user_id"]})
    pending_missions = await db.missions.count_documents({"owner_id": user["user_id"], "status": "pending"})
    active_missions = await db.missions.count_documents({"owner_id": user["user_id"], "status": {"$in": ["assigned", "in_progress"]}})
    completed_missions = await db.missions.count_documents({"owner_id": user["user_id"], "status": "completed"})
    open_emergencies = await db.emergency_requests.count_documents({"owner_id": user["user_id"], "status": "open"})

    # Today's missions
    todays_missions = await db.missions.find(
        {"owner_id": user["user_id"], "scheduled_date": {"$gte": today.isoformat(), "$lt": tomorrow.isoformat()}},
        {"_id": 0}
    ).to_list(50)

    for m in todays_missions:
        prop = await db.properties.find_one({"property_id": m.get("property_id")}, {"_id": 0, "name": 1})
        if prop:
            m["property_name"] = prop.get("name", "")
        for field in ["created_at", "scheduled_date", "started_at", "completed_at"]:
            if isinstance(m.get(field), datetime):
                m[field] = m[field].isoformat()

    # Upcoming missions (next 7 days)
    next_week = today + timedelta(days=7)
    upcoming = await db.missions.find(
        {"owner_id": user["user_id"], "scheduled_date": {"$gte": today.isoformat(), "$lt": next_week.isoformat()}, "status": {"$in": ["pending", "assigned"]}},
        {"_id": 0}
    ).sort("scheduled_date", 1).to_list(20)

    for m in upcoming:
        prop = await db.properties.find_one({"property_id": m.get("property_id")}, {"_id": 0, "name": 1})
        if prop:
            m["property_name"] = prop.get("name", "")
        for field in ["created_at", "scheduled_date", "started_at", "completed_at"]:
            if isinstance(m.get(field), datetime):
                m[field] = m[field].isoformat()

    return {
        "total_properties": total_properties,
        "total_missions": total_missions,
        "pending_missions": pending_missions,
        "active_missions": active_missions,
        "completed_missions": completed_missions,
        "open_emergencies": open_emergencies,
        "todays_missions": todays_missions,
        "upcoming_missions": upcoming
    }


# ============== HELPERS ==============

async def _assign_provider(mission_id: str, provider_id: str, rate: Optional[float] = None):
    """Assign a provider to a mission and send mock email with access info."""
    await db.missions.update_one(
        {"mission_id": mission_id},
        {"$set": {"status": "assigned", "assigned_provider_id": provider_id}}
    )

    mission = await db.missions.find_one({"mission_id": mission_id}, {"_id": 0})
    prop = await db.properties.find_one({"property_id": mission.get("property_id")}, {"_id": 0})
    provider = await db.users.find_one({"user_id": provider_id}, {"_id": 0})

    if prop and provider:
        await _mock_email(
            provider.get("email", ""),
            f"Mission assignée - {prop.get('name', '')}",
            f"Vous avez été assigné à une mission.\n\nLogement: {prop.get('name')}\nAdresse: {prop.get('address')}\nCode d'accès: {prop.get('access_code', 'N/A')}\nInstructions: {prop.get('instructions', 'N/A')}\nDépôt linge: {prop.get('deposit_location', 'N/A')}\nTarif: {rate}€"
        )

    # Notify provider
    if provider:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": provider_id,
            "title": "Mission assignée",
            "body": f"Vous avez été assigné à une mission de {mission.get('mission_type', 'ménage')}",
            "type": "mission_assigned",
            "reference_id": mission_id,
            "read": False,
            "created_at": datetime.now(timezone.utc)
        })


async def _notify_providers(notif_type: str, message: str, reference_id: str):
    """Send notification to available providers."""
    providers = await db.provider_profiles.find({"available": True}, {"_id": 0, "provider_id": 1}).to_list(100)
    for p in providers:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": p["provider_id"],
            "title": "Nouvelle opportunité" if notif_type == "mission" else "Urgence",
            "body": message,
            "type": notif_type,
            "reference_id": reference_id,
            "read": False,
            "created_at": datetime.now(timezone.utc)
        })


async def _mock_email(to: str, subject: str, body: str):
    """Log a mock email (MOCKED - no real sending)."""
    await db.email_logs.insert_one({
        "log_id": f"email_{uuid.uuid4().hex[:12]}",
        "to": to,
        "subject": subject,
        "body": body,
        "status": "mocked",
        "created_at": datetime.now(timezone.utc)
    })
    logger.info(f"[MOCK EMAIL] To: {to} | Subject: {subject}")


# ============== SEED DATA ==============

@app.on_event("startup")
async def seed_service_types():
    """Seed service types if not already present."""
    count = await db.service_types.count_documents({})
    if count == 0:
        service_types = [
            {"service_type_id": "st_cleaning", "name": "Ménage", "category": "cleaning", "icon": "sparkles"},
            {"service_type_id": "st_linen", "name": "Linge", "category": "cleaning", "icon": "shirt"},
            {"service_type_id": "st_plumbing", "name": "Plomberie", "category": "emergency", "icon": "droplets"},
            {"service_type_id": "st_electrical", "name": "Électricité", "category": "emergency", "icon": "zap"},
            {"service_type_id": "st_locksmith", "name": "Serrurerie", "category": "emergency", "icon": "key"},
            {"service_type_id": "st_jacuzzi", "name": "Jacuzzi / Spa", "category": "emergency", "icon": "waves"},
            {"service_type_id": "st_repair", "name": "Réparation générale", "category": "emergency", "icon": "wrench"},
            {"service_type_id": "st_maintenance", "name": "Maintenance", "category": "maintenance", "icon": "settings"},
        ]
        await db.service_types.insert_many(service_types)
        logger.info("Service types seeded")


# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
