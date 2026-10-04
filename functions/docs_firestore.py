"""Firestore client selection for deployed Functions and local emulators."""

import os

from firebase_admin import firestore as admin_firestore
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore


def client():
    if os.environ.get("FIRESTORE_EMULATOR_HOST"):
        project_id = os.environ.get("GCLOUD_PROJECT")
        if not project_id:
            raise RuntimeError("GCLOUD_PROJECT is required for the Firestore emulator")
        return firestore.Client(project=project_id, credentials=AnonymousCredentials())
    return admin_firestore.client()
