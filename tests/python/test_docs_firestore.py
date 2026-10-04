from unittest.mock import Mock

from google.auth.credentials import AnonymousCredentials

import docs_firestore


def test_emulator_client_uses_its_project_without_adc(monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    monkeypatch.setenv("GCLOUD_PROJECT", "demo-lifepoints")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/does/not/exist.json")
    db = docs_firestore.client()
    assert db.project == "demo-lifepoints"
    assert isinstance(db._credentials, AnonymousCredentials)


def test_deployed_client_uses_admin_sdk(monkeypatch):
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    expected = Mock()
    admin_client = Mock(return_value=expected)
    monkeypatch.setattr(docs_firestore.admin_firestore, "client", admin_client)
    assert docs_firestore.client() is expected
    admin_client.assert_called_once_with()
