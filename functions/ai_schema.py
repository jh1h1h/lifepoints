"""Strict single-action contract for model output."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator


EntityId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{8,100}$")]
Name = Annotated[str, StringConstraints(min_length=1, max_length=120)]
Content = Annotated[str, StringConstraints(max_length=200000)]
Fragment = Annotated[str, StringConstraints(min_length=1, max_length=10000)]
Reason = Annotated[str, StringConstraints(max_length=500)]
EntityType = Literal["friend", "project"]
ChangeType = Literal["correction", "new_information", "unspecified"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class CreateAction(StrictModel):
    schemaVersion: Literal[1]
    action: Literal["create"]
    entityType: EntityType
    name: Name
    content: Content = ""
    changeType: ChangeType = "new_information"
    reason: Reason = ""


class TargetedAction(StrictModel):
    entityType: EntityType
    entityId: EntityId
    expectedRevision: Annotated[int, Field(ge=1)]
    reason: Reason = ""


class AddAction(TargetedAction):
    schemaVersion: Literal[1]
    action: Literal["add"]
    scope: Literal["content"]
    newText: Fragment
    afterText: str | None = None
    changeType: ChangeType = "new_information"


class ModifyAction(TargetedAction):
    schemaVersion: Literal[1]
    action: Literal["modify"]
    scope: Literal["content"]
    oldText: Fragment
    newText: Content
    changeType: ChangeType


class DeleteAction(TargetedAction):
    schemaVersion: Literal[1]
    action: Literal["delete"]
    scope: Literal["content", "entity"]
    oldText: str | None = None
    changeType: ChangeType = "unspecified"

    @model_validator(mode="after")
    def validate_scope(self):
        if self.scope == "content" and not self.oldText:
            raise ValueError("Content deletion needs exact oldText")
        if self.scope == "entity" and self.oldText is not None:
            raise ValueError("Entity deletion cannot include oldText")
        return self


class Reference(StrictModel):
    entityId: EntityId
    revision: Annotated[int, Field(ge=1)]
    eventIds: list[str] = Field(default_factory=list, max_length=1000)


class QueryAction(StrictModel):
    schemaVersion: Literal[1]
    action: Literal["query"]
    answer: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    references: list[Reference] = Field(default_factory=list, max_length=20)


class Choice(StrictModel):
    entityId: EntityId
    entityType: EntityType
    name: Name


class ClarifyAction(StrictModel):
    schemaVersion: Literal[1]
    action: Literal["clarify"]
    question: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    choices: list[Choice] = Field(default_factory=list, max_length=20)


Action = Annotated[
    Union[CreateAction, AddAction, ModifyAction, DeleteAction, QueryAction, ClarifyAction],
    Field(discriminator="action"),
]
ACTION_ADAPTER = TypeAdapter(Action)


def parse_action(raw: str):
    return ACTION_ADAPTER.validate_json(raw, strict=True)
