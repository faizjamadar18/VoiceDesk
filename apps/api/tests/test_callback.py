import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


def test_callback_endpoint_returns_html(client):
    response = client.get("/callback")

    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Login Successful" in response.text
    assert "voicedesk://auth/callback" in response.text
    assert "Open VoiceDesk" in response.text


def test_auth_callback_alias_returns_html(client):
    response = client.get("/auth/callback")

    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Login Successful" in response.text
    assert "voicedesk://auth/callback" in response.text
    assert "Open VoiceDesk" in response.text
