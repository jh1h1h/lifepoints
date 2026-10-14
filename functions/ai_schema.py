"""Strict routing/query contract for the Docs model."""
from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter

EntityId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{8,100}$")]
Name = Annotated[str, StringConstraints(min_length=1, max_length=120)]
EntityType = Literal["friend", "project"]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

class AddAction(StrictModel):
    schemaVersion: Literal[2]
    action: Literal["add"]
    entityType: EntityType
    entityId: EntityId
    expectedRevision: Annotated[int, Field(ge=1)]
    conflicts: list[EntityId] = Field(default_factory=list, max_length=20)

class CreateAction(StrictModel):
    schemaVersion: Literal[2]
    action: Literal["create"]
    entityType: EntityType
    name: Name
    conflicts: list[EntityId] = Field(default_factory=list, max_length=0)

class Reference(StrictModel):
    entityId: EntityId
    sectionIds: list[EntityId] = Field(default_factory=list, max_length=100)

class QueryAction(StrictModel):
    schemaVersion: Literal[2]
    action: Literal["query"]
    answer: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    references: list[Reference] = Field(default_factory=list, max_length=20)

class Choice(StrictModel):
    entityId: EntityId
    entityType: EntityType
    name: Name

class ClarifyAction(StrictModel):
    schemaVersion: Literal[2]
    action: Literal["clarify"]
    question: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    choices: list[Choice] = Field(default_factory=list, max_length=20)

Action = Annotated[Union[AddAction, CreateAction, QueryAction, ClarifyAction], Field(discriminator="action")]
ACTION_ADAPTER = TypeAdapter(Action)

def parse_action(raw: str):
    return ACTION_ADAPTER.validate_json(raw, strict=True)
