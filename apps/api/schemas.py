"""Pydantic representations of the canonical OTLP/HTTP JSON contract."""

from __future__ import annotations

from typing import Any, Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


HEX32 = r"^[0-9a-fA-F]{32}$"
HEX16 = r"^[0-9a-fA-F]{16}$"


class OTLPModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")


class AnyValue(OTLPModel):
    string_value: str | None = Field(default=None, alias="stringValue")
    bool_value: bool | None = Field(default=None, alias="boolValue")
    int_value: int | str | None = Field(default=None, alias="intValue")
    double_value: float | None = Field(default=None, alias="doubleValue")
    bytes_value: str | None = Field(default=None, alias="bytesValue")
    array_value: dict[str, Any] | None = Field(default=None, alias="arrayValue")
    kvlist_value: dict[str, Any] | None = Field(default=None, alias="kvlistValue")


class KeyValue(OTLPModel):
    key: str = Field(min_length=1, max_length=1024)
    value: AnyValue


class Resource(OTLPModel):
    attributes: list[KeyValue] = Field(default_factory=list)


class InstrumentationScope(OTLPModel):
    name: str = Field(default="", max_length=255)
    version: str | None = Field(default=None, max_length=255)
    attributes: list[KeyValue] = Field(default_factory=list)


class SpanStatus(OTLPModel):
    code: int | None = Field(default=None, ge=0, le=2)
    message: str | None = None


class Span(OTLPModel):
    trace_id: Annotated[str, Field(alias="traceId", pattern=HEX32)]
    span_id: Annotated[str, Field(alias="spanId", pattern=HEX16)]
    parent_span_id: Annotated[str | None, Field(default=None, alias="parentSpanId", pattern=HEX16)]
    name: str = Field(min_length=1, max_length=1024)
    kind: int = Field(default=0, ge=0, le=5)
    start_time_unix_nano: int | str | None = Field(default=None, alias="startTimeUnixNano")
    end_time_unix_nano: int | str | None = Field(default=None, alias="endTimeUnixNano")
    attributes: list[KeyValue] = Field(default_factory=list)
    events: list[dict[str, Any]] = Field(default_factory=list)
    links: list[dict[str, Any]] = Field(default_factory=list)
    status: SpanStatus | None = None


class ScopeSpans(OTLPModel):
    scope: InstrumentationScope | None = None
    spans: list[Span] = Field(default_factory=list)


class ResourceSpans(OTLPModel):
    resource: Resource | None = None
    scope_spans: list[ScopeSpans] = Field(default_factory=list, alias="scopeSpans")


class OTLPExportRequest(OTLPModel):
    resource_spans: list[ResourceSpans] = Field(default_factory=list, alias="resourceSpans")


class IngestionResponse(BaseModel):
    accepted: int = Field(ge=0)
    rejected: int = Field(default=0, ge=0)
