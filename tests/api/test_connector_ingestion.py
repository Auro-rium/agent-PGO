"""Connector contract tests for OTLP ingestion and profiling."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import issue_api_key
from apps.api.db import create_session_factory, create_tables
from apps.api.main import create_app
from apps.api.models import Organization, Project, Trace


@pytest.fixture()
def connector_client(tmp_path):
    factory = create_session_factory(f"sqlite:///{tmp_path / 'connector.db'}")
    create_tables(factory)
    with factory.begin() as session:
        first_org = Organization(name="First org")
        second_org = Organization(name="Second org")
        session.add_all([first_org, second_org])
        session.flush()
        first_project = Project(name="Research", slug="research", organization_id=first_org.id)
        second_project = Project(name="Other", slug="other", organization_id=second_org.id)
        session.add_all([first_project, second_project])
        session.flush()
        first_secret, first_key = issue_api_key(organization_id=first_org.id, project_id=first_project.id)
        second_secret, second_key = issue_api_key(organization_id=second_org.id, project_id=second_project.id)
        session.add_all([first_key, second_key])
        session.flush()
        ids = {
            "first_project": first_project.id,
            "second_project": second_project.id,
            "first_secret": first_secret,
            "second_secret": second_secret,
        }
    app = create_app(session_factory=factory)
    with TestClient(app) as client:
        client.connector_ids = ids
        yield client


def connector_payload(*, trace_id: str = "a" * 32, span_id: str = "b" * 16) -> dict:
    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "open-deep-research"}},
                        {"key": "deployment.environment", "value": {"stringValue": "test"}},
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "@agentpgo/sdk", "version": "1.0.0"},
                        "spans": [
                            {
                                "traceId": trace_id,
                                "spanId": span_id,
                                "name": "agent.node.researcher",
                                "kind": 1,
                                "startTimeUnixNano": "1720000000000000000",
                                "endTimeUnixNano": "1720000003810000000",
                                "attributes": [
                                    {"key": "agentpgo.node", "value": {"stringValue": "researcher"}},
                                    {"key": "gen_ai.system", "value": {"stringValue": "openai"}},
                                    {"key": "gen_ai.request.model", "value": {"stringValue": "gpt-5.6-sol"}},
                                    {"key": "gen_ai.response.model", "value": {"stringValue": "gpt-5.6-sol"}},
                                    {"key": "gen_ai.usage.input_tokens", "value": {"intValue": "18342"}},
                                    {"key": "gen_ai.usage.output_tokens", "value": {"intValue": "1282"}},
                                    {"key": "agentpgo.cost.usd", "value": {"doubleValue": 0.382}},
                                ],
                                "status": {"code": 1},
                            }
                        ],
                    }
                ],
            }
        ]
    }


def auth(client: TestClient, which: str = "first_secret") -> dict[str, str]:
    return {"x-api-key": client.connector_ids[which]}


def test_connector_otlp_payload_is_persisted_with_model_node_usage_and_latency(connector_client):
    response = connector_client.post("/v1/otlp/v1/traces", headers=auth(connector_client), json=connector_payload())

    assert response.status_code == 200
    assert response.json() == {"accepted": 1, "rejected": 0}

    with connector_client.app.state.session_factory() as session:
        span = session.query(Trace).one()
        assert span.service_name == "open-deep-research"
        assert span.attributes["agentpgo.node"] == "researcher"
        assert span.attributes["gen_ai.request.model"] == "gpt-5.6-sol"
        assert span.attributes["gen_ai.usage.input_tokens"] == "18342"
        assert span.attributes["gen_ai.usage.output_tokens"] == "1282"
        assert span.attributes["agentpgo.cost.usd"] == 0.382
        assert (span.end_time - span.start_time).total_seconds() * 1000 == pytest.approx(3810.0)


def test_connector_replay_is_idempotent_and_profile_counts_one_call(connector_client):
    payload = connector_payload()
    headers = auth(connector_client)

    first = connector_client.post("/v1/traces", headers=headers, json=payload)
    replay = connector_client.post("/v1/traces", headers=headers, json=payload)
    profile = connector_client.get(
        f"/v1/projects/{connector_client.connector_ids['first_project']}/profile",
        headers=headers,
    )

    assert first.json()["accepted"] == 1
    assert replay.json()["accepted"] == 0
    assert profile.status_code == 200
    assert profile.json()["runs_observed"] == 1
    assert profile.json()["model_calls"] == 1
    assert profile.json()["p50_latency_ms"] == pytest.approx(3810.0)
    assert profile.json()["p95_latency_ms"] == pytest.approx(3810.0)


def test_connector_project_key_cannot_ingest_or_profile_another_project(connector_client):
    headers = auth(connector_client)
    payload = connector_payload(trace_id="c" * 32, span_id="d" * 16)

    ingest = connector_client.post(
        f"/v1/traces?project_id={connector_client.connector_ids['second_project']}",
        headers=headers,
        json=payload,
    )
    profile = connector_client.get(
        f"/v1/projects/{connector_client.connector_ids['second_project']}/profile",
        headers=headers,
    )

    assert ingest.status_code == 403
    assert profile.status_code == 403
