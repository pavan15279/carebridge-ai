"""
CareBridge AI: Hackathon Authentication Manager
Supports:
  - Demo patient login (Patient ID + shared demo password)
  - Real account signup (email + password, hashed with pbkdf2_hmac)
  - Real account login (email + password)

⚠️ HACKATHON MVP NOTICE:
This authentication implementation is intended for the CareBridge AI hackathon
MVP demonstration and is NOT production-grade identity management. Sessions and
account data are held in-process memory only and do not survive restarts.
Do not use this implementation in clinical production environments.
"""
import hashlib
import hmac
import os
import re
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from app.core.session_store import session_store

# ── Demo cohort ────────────────────────────────────────────────────────────
# Universal demo password for all hackathon demo and dynamically created
# patients that are onboarded through the existing PT-USER-* dynamic pathway
# (NOT through email signup).
DEMO_PASSWORD: str = "CareBridge@123"

DEMO_PATIENT_NAMES: Dict[str, str] = {
    "PT-CABG-001": "James Harrison",
    "PT-TKA-002": "Elena Rostova",
    "PT-CHF-003": "Marcus Vance",
    "PT-PNA-004": "Sarah Chen",
}

# ── Password hashing helpers ───────────────────────────────────────────────
_PBKDF2_ITERATIONS = 260_000
_HASH_ALGO = "sha256"


def _hash_password(plaintext: str) -> str:
    """
    Hashes a password using PBKDF2-HMAC-SHA256 with a random 16-byte salt.
    Returns a storable string: '<salt_hex>:<hash_hex>'.
    Plaintext passwords are NEVER stored.
    """
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac(_HASH_ALGO, plaintext.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"{salt.hex()}:{dk.hex()}"


def _verify_password(plaintext: str, stored: str) -> bool:
    """
    Verifies a plaintext password against a stored '<salt_hex>:<hash_hex>' string.
    Returns True if the password matches; False otherwise.
    Plaintext is never compared directly to the stored value.
    """
    try:
        salt_hex, hash_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.pbkdf2_hmac(
            _HASH_ALGO, plaintext.encode("utf-8"), salt, _PBKDF2_ITERATIONS
        )
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _is_valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email))


# ── Neutral onboarding care tasks ─────────────────────────────────────────
def _neutral_onboarding_tasks(patient_id: str) -> list:
    """
    Returns 3 generic, non-diagnostic onboarding tasks for a new self-registered
    patient. No diagnosis, medications, physician, or medical advice is fabricated.
    """
    return [
        {
            "task_id": f"TASK-{patient_id}-ONBOARD-01",
            "patient_id": patient_id,
            "day_number": 1,
            "category": "CHECK_IN",
            "title": "Welcome Check-In",
            "description": (
                "Welcome to CareBridge AI. Please complete your profile by uploading "
                "your discharge paperwork so your care team can set up a personalised "
                "recovery plan."
            ),
            "scheduled_time": "09:00",
            "is_critical": False,
            "status": "PENDING",
        },
        {
            "task_id": f"TASK-{patient_id}-ONBOARD-02",
            "patient_id": patient_id,
            "day_number": 1,
            "category": "VITAL_CHECK",
            "title": "Record Available Vitals",
            "description": "Record any available vital measurements so they can be reviewed when appropriate.",
            "scheduled_time": "12:00",
            "is_critical": False,
            "status": "PENDING",
        },
        {
            "task_id": f"TASK-{patient_id}-ONBOARD-03",
            "patient_id": patient_id,
            "day_number": 1,
            "category": "CHECK_IN",
            "title": "Upload Discharge Paperwork",
            "description": (
                "Use the 'Upload Paperwork' button in the header to upload your "
                "hospital discharge summary (PDF or TXT). This allows CareBridge AI "
                "to generate your personalised recovery roadmap."
            ),
            "scheduled_time": "15:00",
            "is_critical": False,
            "status": "PENDING",
        },
    ]


# ── Auth Manager ───────────────────────────────────────────────────────────
class CareBridgeAuthManager:
    """
    Thread-safe in-memory authentication manager for CareBridge AI hackathon MVP.

    Supports two authentication pathways:
      1. Demo/Dynamic Patient Login: Patient ID + shared demo password (CareBridge@123)
      2. Email Account Login/Signup: email + individually hashed password (pbkdf2_hmac)

    ⚠️ In-process memory only — sessions and accounts do NOT persist across restarts.
    This is NOT production-grade identity management.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        # Session store: token → session_info dict
        self._sessions: Dict[str, Dict[str, Any]] = {}
        # Email account store: normalised_email → account_info dict
        # account_info keys: hashed_password, patient_id, patient_name, created_at
        # Passwords are NEVER stored in plaintext.
        self._accounts: Dict[str, Dict[str, Any]] = {}

    # ── Demo / Dynamic Patient Login ────────────────────────────────────────
    def login(self, patient_id: str, password: str) -> Dict[str, Any]:
        """
        Authenticates a demo or dynamically-onboarded patient using Patient ID
        and the shared demo password (CareBridge@123).

        Returns session dict with token and patient metadata.
        Raises KeyError if patient_id is not found.
        Raises ValueError if password is incorrect.
        Passwords are never returned to callers.
        """
        clean_id = (patient_id or "").strip()
        clean_pw = (password or "").strip()

        if not clean_id:
            raise KeyError("Patient ID is required.")

        # Check patient exists in session store (synthetic or dynamic)
        patient_data = session_store.get_patient_data(clean_id)
        if not patient_data:
            if clean_id not in DEMO_PATIENT_NAMES:
                raise KeyError(f"Patient ID '{clean_id}' not found.")

        # Validate password — demo path uses the shared demo password only
        if clean_pw != DEMO_PASSWORD:
            raise ValueError("Invalid password.")

        patient_name = DEMO_PATIENT_NAMES.get(clean_id, clean_id)
        if patient_data and "patient" in patient_data:
            p_obj = patient_data["patient"]
            combined = f"{p_obj.get('first_name', '')} {p_obj.get('last_name', '')}".strip()
            if combined:
                patient_name = combined

        return self._create_session(clean_id, patient_name)

    # ── Email Signup ────────────────────────────────────────────────────────
    def signup(
        self,
        full_name: str,
        email: str,
        password: str,
        confirm_password: str,
    ) -> Dict[str, Any]:
        """
        Registers a new user account with email and hashed password.

        Validation rules:
          - full_name: non-empty
          - email: valid format, not already registered
          - password: >= 8 characters
          - confirm_password: must match password

        On success:
          - Generates a unique PT-USER-* patient ID
          - Hashes the password (pbkdf2_hmac) — plaintext is never stored
          - Registers a neutral onboarding patient in session_store
          - Creates and returns a session

        Raises ValueError with a human-readable message on any validation failure.
        Passwords are never returned to callers.
        """
        # Input sanitisation
        full_name = (full_name or "").strip()
        email = (email or "").strip().lower()
        password = password or ""
        confirm_password = confirm_password or ""

        if not full_name:
            raise ValueError("Full name is required.")
        if not email:
            raise ValueError("Email address is required.")
        if not _is_valid_email(email):
            raise ValueError("Please enter a valid email address.")
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if password != confirm_password:
            raise ValueError("Passwords do not match.")

        with self._lock:
            if email in self._accounts:
                raise ValueError("An account with this email address already exists.")

            # Generate unique patient ID
            patient_id = f"PT-USER-{uuid.uuid4().hex[:8].upper()}"

            # Derive a display name from the provided full name
            name_parts = full_name.split()
            first_name = name_parts[0]
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else "Patient"
            patient_name = f"{first_name} {last_name}".strip()

            # Hash the password — plaintext is discarded after this call
            hashed_pw = _hash_password(password)

            # Register neutral patient in session store
            neutral_data = {
                "patient": {
                    "id": patient_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "age": None,
                    "gender": "Not specified",
                    "discharge_date": "Not specified",
                    "condition_category": "General Post-Discharge Recovery",
                    "primary_care_physician": "Not specified",
                    "clinic_phone": "Not specified",
                    "emergency_contact": "Not specified",
                    "primary_diagnosis": "Not specified",
                    "is_demo": False,
                },
                "discharge_profile": {
                    "profile_id": f"DP-{patient_id}",
                    "patient_id": patient_id,
                    "primary_diagnosis": "Not specified",
                    "procedures": [],
                    "discharge_date": "Not specified",
                    "dietary_instructions": "Not specified.",
                    "activity_restrictions": "Not specified.",
                    "wound_care_instructions": "Not specified.",
                    "medications": [],
                    "red_flag_warnings": [],
                    "follow_up_appointments": [],
                },
                "initial_care_tasks_day_2": _neutral_onboarding_tasks(patient_id),
            }
            session_store.register_raw_patient(patient_id, neutral_data)

            # Store account (hashed password only)
            self._accounts[email] = {
                "hashed_password": hashed_pw,
                "patient_id": patient_id,
                "patient_name": patient_name,
                "created_at": datetime.utcnow().isoformat(),
            }

        return self._create_session(patient_id, patient_name)

    # ── Email Login ─────────────────────────────────────────────────────────
    def login_with_email(self, email: str, password: str) -> Dict[str, Any]:
        """
        Authenticates a registered user by email and password.

        Raises KeyError if the email is not registered.
        Raises ValueError if the password is incorrect.
        Passwords are never returned to callers.
        """
        email = (email or "").strip().lower()
        password = password or ""

        if not email:
            raise KeyError("Email address is required.")

        with self._lock:
            account = self._accounts.get(email)

        if not account:
            raise KeyError("No account found for this email address.")

        if not _verify_password(password, account["hashed_password"]):
            raise ValueError("Incorrect password.")

        return self._create_session(account["patient_id"], account["patient_name"])

    # ── Session Management ──────────────────────────────────────────────────
    def _create_session(self, patient_id: str, patient_name: str) -> Dict[str, Any]:
        token = f"cb_sess_{uuid.uuid4().hex}"
        session_info = {
            "session_token": token,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "created_at": datetime.utcnow().isoformat(),
        }
        with self._lock:
            self._sessions[token] = session_info
        return session_info

    def logout(self, token: str) -> bool:
        """Invalidates an active session token."""
        if not token:
            return False
        with self._lock:
            return self._sessions.pop(token, None) is not None

    def get_session(self, token: str) -> Optional[Dict[str, Any]]:
        """Retrieves session information by token if valid."""
        if not token:
            return None
        with self._lock:
            return self._sessions.get(token)

    def get_patient_for_token(self, token: str) -> Optional[str]:
        """Returns the authenticated patient ID for a token, or None if invalid."""
        sess = self.get_session(token)
        return sess.get("patient_id") if sess else None

    def verify_patient_access(
        self, token: Optional[str], requested_patient_id: str
    ) -> Tuple[bool, str, int]:
        """
        Enforces patient isolation:
          1. (False, msg, 401) if token missing or invalid
          2. (False, msg, 403) if authenticated patient != requested patient
          3. (True, '', 200)  if authorised
        """
        if not token:
            return (
                False,
                "Authentication required. Please provide a valid session token.",
                401,
            )
        auth_patient = self.get_patient_for_token(token)
        if not auth_patient:
            return (
                False,
                "Invalid or expired session. Please log in again.",
                401,
            )
        if auth_patient != requested_patient_id:
            return (
                False,
                (
                    f"Access denied: Logged-in patient '{auth_patient}' is not "
                    f"authorised to access data for patient '{requested_patient_id}'."
                ),
                403,
            )
        return (True, "", 200)

    def clear_all_sessions(self) -> None:
        """Resets all active sessions and accounts (useful for unit testing)."""
        with self._lock:
            self._sessions.clear()

    def clear_all_accounts(self) -> None:
        """Resets all registered email accounts (useful for unit testing)."""
        with self._lock:
            self._accounts.clear()


# Global singleton authentication instance
auth_manager = CareBridgeAuthManager()
